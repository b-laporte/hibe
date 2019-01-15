'use strict';

const DATASET = "DATASET";
let ID_COUNT = 1, MAX_ITERATION = 10000, RX_INT = /^\d+$/, RX_H_PROP = /^\$/;
let NEW_MODE = false, COPY_MODE = false; // global variable to bypass the setters during constructor call

function dsId() {
    // return a unique dataset id - very useful for debug purposes (cf. $log())
    return ID_COUNT++;
}

export function lastDatasetId() {
    // used for some tests
    return ID_COUNT - 1;
}

/**
 * Dataset decorator
 * Mark dataset classes and transform them to support all necessary features
 * @param c the dataset constructor
 */
export function Data() {
    return function (c: any) {
        let proto = c.prototype, firstRun = true;
        patchIntoHObject(proto);

        class Dataset extends c {
            constructor() {
                let prevMode = NEW_MODE;
                NEW_MODE = true;
                super();
                if (firstRun) {
                    let v: any, m = this["$pMap"]; // property Map
                    for (let k in this) {
                        if (k && this.hasOwnProperty(k) && k[0] !== "$" && (!m || !m[k])) {
                            v = this[k];
                            delete this[k]; // remove value from current object (would hide the prototype)
                            setValuePropInfo(proto, k); // set getters and setters on the prototype
                            this[k] = v; // call the setter with the initial value
                        }
                    }
                    Object.seal(proto);
                    firstRun = false;
                }
                this.$id = dsId();
                this.$initMode = false;
                if (!COPY_MODE && this.init) {
                    this.$initMode = true;
                    this.init();
                    this.$initMode = false;
                }
                NEW_MODE = prevMode;
            }
        };
        proto.$className = c.name;

        proto.$new = function (forCopy = false) {
            let prevMode = COPY_MODE;
            COPY_MODE = forCopy;
            let o = new Dataset();
            COPY_MODE = prevMode;
            return o;
        }
        proto.$log = log;
        proto.$dsFactory = true; // used for load / create

        return Dataset as any;
    }
};

/**
 * Log debug info on a dataset structure into the console or into an array
 * @param d the dataset to trace
 * @param out an optional array as output
 */
export function log(this: DataNode, depth = 3, out?: string[], idOffset?: number) {
    if (out) {
        out.splice(0, out.length);
    }
    let r: string[] = out || [];
    idOffset = idOffset || 0;
    trace(this, depth + 1, r, "", "", "", idOffset, -1);
    return out ? "" : r.join("\n");
}

function trace(d: any, depth: number, out: string[], padding: string, line1: string, prefix: string, idOffset, parentId: number) {
    if (depth < 0) return
    if (d && d.$kind === DATASET) {
        function traceProps(props, pid) {
            let ds = d.$mn || d, prefix = d.$mn ? "$mn." : "";
            if (props && props.length) {
                for (let i = 0; props.length > i; i++) {
                    trace(ds["$$" + props[i]], depth - 1, out, padding + "  ", prefix + props[i] + ": ", "", idOffset, pid);
                }
            }
        }
        function name(ds: DataNode) {
            let im = "";
            if (ds.$next) {
                im = " IMMUTABLE";
            } else if (ds.$mn) {
                im = " MUTATING";
            }
            let pr = " no-parents";
            if (ds.$dmd && ds.$dmd.parents) {
                let arr: string[] = [], parentFound = false;
                ds.$dmd.parents.forEach((p) => {
                    parentFound = parentFound || (p.$id === parentId);
                    if (p["$isProxy"]) {
                        arr.push("Proxy(#" + (p.$id + idOffset) + ")");
                    } else {
                        arr.push("#" + (p.$id + idOffset));
                    }
                })
                if (arr.length) {
                    pr = (arr.length === 1 ? " parent:" : " parents") + arr.join(",");
                }
                if (!parentFound && parentId > -1) {
                    pr += "=>** ERROR **";
                }

            }
            let oid = "#" + (ds.$id + idOffset);
            if (ds["$isProxy"]) {
                oid = "Proxy(" + oid + ")";
            }
            return "[" + ds.$className + "]" + oid + im + pr;
        }
        let mn = "";
        if (d.$next) {
            mn = " -> $next:#" + (d.$next.$id + idOffset);
        } else if (d.$mn) {
            mn = " -> $mn:#" + (d.$mn.$id + idOffset);
        }
        out.push(padding + line1 + name(d) + mn);
        if (depth === 1) {
            out.push(padding + "  (...)");
        } else {
            let id = d.$id;
            if (d.forEach) {
                let prefix = d.$mn ? "$mn." : "";
                d.forEach((value, key) => {
                    trace(value, depth - 1, out, padding + "  ", prefix + key + ": ", "", idOffset, id);
                });
            } else {
                traceProps(d.$vProps, id);
                traceProps(d.$dProps, id);
            }
        }
    } else if (d !== undefined && d !== null) {
        out.push(padding + line1 + d.toString());
    }
}

/**
 * Tell if a mutation is ongoing on a given data node
 * @param o the data node to assert
 */
export function isMutating(o): boolean {
    return o ? o.$mn !== undefined : false;
}

/**
 * Tell if a dataset instance has become immutable
 * @param o the data node to assert
 */
export function isImmutable(o): boolean {
    return o.$next !== undefined;
}

/**
 * Tell if an object is a dataset
 * @param o 
 */
export function isDataset(o: any): boolean {
    return !!(o && o["$kind"] === DATASET);
}

/**
 * Return a promise that will be resolved when all mutations are processed and the object is immutable
 * The function will return the new version of the data object (previous version will still be available with its original values)
 * @param d {HObject} the data object to process
 */
export async function mutationComplete<T>(dataset: T): Promise<T> {
    // this function returns when the dataset is processed (and becomes immutable)
    let d = dataset as any;
    if (!isDataset(d)) return d;
    if (d && (d.$next)) {
        console.error("[Hibe] Mutation cannot be observed on an immutable object");
        return d;
    }
    let dmd = retrieveDmd(d, "mutationComplete");
    if (dmd && d.$mn) {
        return new Promise(function (resolve, reject) {
            let onFreeze = dmd!.onFreeze;
            if (!onFreeze) {
                dmd!.onFreeze = [resolve];
            } else {
                onFreeze.push(resolve);
            }
        }) as any;
    }
    return d;
}

/**
 * Return the last version of a data node instance
 * @param dataNode 
 */
export function latestVersion<T>(dataNode: T): T {
    let d: any = dataNode;
    // fast case first
    if (!d || !d.$next) return d;
    if (!d.$next.$next) return d.$next;
    let c = 0;
    do {
        d = d.$next;
        if (!d.$next) return d;
        c++;
    } while (c < MAX_ITERATION);
    // we should never get here
    console.error("Hibe error: Max iteration reached in version linked list");
    return d;
}

/**
 * Fills a proto info structure with some more property description
 * @param proto the proto info structure
 * @param propName name of the property
 * @param isDataNode true if the property is a datanode
 */
function addPropertyInfo(proto: any, propName: string, isDataNode: boolean, desc: PropertyDescriptor | undefined) {
    let nm1 = isDataNode ? "$dProps" : "$vProps",
        nm2 = isDataNode ? "$dProps2" : "$vProps2";
    if (!proto[nm1]) {
        proto[nm1] = [];
        proto[nm2] = [];
        proto["$pMap"] = {}; // property map
    } else if (!proto.hasOwnProperty(nm1)) {
        // we are in a sub-class of a dataset -> copy the proto arrays
        proto[nm1] = proto[nm1].slice(0);
        proto[nm2] = proto[nm2].slice(0);
    }
    proto[nm1].push(propName);
    proto[nm2].push("$$" + propName);
    proto["$pMap"][propName] = 1;
    // proto["$$" + propName] = defaultValue;
    if (desc && delete proto[propName]) {
        Object.defineProperty(proto, propName, desc);
    }
}

interface Constructor<T> {
    new(): T;
}

interface Factory<T> {
    $dsFactory?: true;
    $new(json?: Object): T;
}

export function data<T>(cf: Constructor<T> | Factory<T>, autoCreate = true) {
    return function (proto, key: string) {
        // proto = object prototype
        // key = the property name (e.g. "value")
        let $$key = "$$" + key;
        addPropertyInfo(proto, key, true, {
            get: function () { return $get(<any>this, $$key, key, cf, autoCreate); },
            set: function (v) { $set(<any>this, $$key, v, cf); },
            enumerable: true,
            configurable: true
        });
    };
}

export function datalist<T>(cf: Constructor<T> | Factory<T>, autoCreate = true) {
    return data(list(cf), autoCreate);
}

export function datamap<K, V>(cf: Constructor<V> | Factory<V>, autoCreate = true) {
    return data(map<K, V>(cf), autoCreate);
}

/**
 * Simple type property decorator factory
 */
export function value() {
    return setValuePropInfo;
}

function setValuePropInfo(proto, key: string) {
    // proto = object prototype
    // key = the property name (e.g. "value")
    let $$key = "$$" + key;
    addPropertyInfo(proto, key, false, {
        get: function () { return $get(<any>this, $$key, key); },
        set: function (v) { $set(<any>this, $$key, v); },
        enumerable: true,
        configurable: true
    });
}

/**
 * Class property decorator for Dataset processed properties
 * Note: processed properties are readonly (i.e. their reference cannot be changed but that can be mutated if their type allows for mutation)
 * @param proto the associated class prototype
 * @param propName the property name
 * @param descriptor the property descriptor
 */
export function computedDecorator(proto, propName: string, descriptor: PropertyDescriptor) {

    // we must wrap the getter with a new getter that will ensure the memoization
    let processor: Function = descriptor.get!, $$propName = "$$" + propName;
    if (!descriptor.get || descriptor.set !== undefined) {
        console.log("[Hibe] computed properties must be defined on property getters only")
        return;
    }
    descriptor.set = undefined;
    descriptor.get = function () {
        //console.log("@computed get " + propName);
        let callProcessor = false, storedValues: any[] | undefined = this[$$propName], result: any;

        // the result of the previous call is stored in the $$propName property that contains
        // the previous result and the pair of previous (name, value) dependencies - e.g. [result, propName1, value1, propName2, value2]
        if (!storedValues) {
            callProcessor = true;
            storedValues = [];
        } else {
            // check that previous dependencies haven't changed
            let len = storedValues.length, val;
            for (let i = 1; len > i; i += 2) {
                val = this[storedValues[i]];
                if (val !== storedValues[i + 1] || isMutating(val)) {
                    callProcessor = true;
                    break;
                }
            }
            result = storedValues[0];
        }
        if (callProcessor) {
            storedValues = [];

            let dependencies = {};

            // call the original getter with a specific watch on getters to retrieve the list of dependencies
            (<any>this).$computeDependencies = dependencies;
            try {
                result = processor.call(this);
            } catch (ex) {
                (<any>this).$computeDependencies = undefined;
                this[$$propName] = undefined;
                throw ex;
            }
            (<any>this).$computeDependencies = undefined;

            storedValues[0] = result;
            // go over all dependencies and store the new values
            for (let key in dependencies) {
                if (dependencies.hasOwnProperty(key)) {
                    if (key === propName) {
                        console.log("[hibe] computed property cannot be called while being calculated");
                        storedValues = undefined;
                        break;
                    }
                    storedValues.push(key);
                    storedValues.push(this[key]);
                }
            }
            this[$$propName] = storedValues;
        }
        return result;
    }
}

export function computed() {
    return computedDecorator;
}

// -----------------------------------------------------------------------------------------------------------------------------
// DataNode classes

/**
 * Patch a dataset prototype to transform it into an HObject
 * @param proto a Dataset prototype
 */
function patchIntoHObject(proto: any) {
    proto.$kind = DATASET;
    proto.$copyProps = $copyProps;
    proto.$updateParentRefs = $updatePropParentRefs;
}

function $copyProps(this: HObject, obj: HObject) {
    copyProps(this.$vProps2, this, obj);
    copyProps(this.$dProps2, this, obj);
    obj.$json = this.$json;
}

function $updatePropParentRefs(this: HObject, previousParent: HObject) {
    let dnProps = this.$dProps2;
    if (dnProps) {
        let idx = dnProps.length, nm: string;
        while (idx--) {
            nm = dnProps[idx];
            this[nm] = updateParentRef(this[nm], previousParent, this);
        }
    }
}

/*
 * DataNode objects
 */
interface DataNode {
    $kind: "DATASET";                   // to easily identify a data node
    $id: number;
    $className: string;                  // class name
    $dmd: DataNodeMetaData | undefined;  // meta-data used to track changes - only set on last version (cf.$next)
    $mn: DataNode | undefined;           // current mutable $next (set if node is being changed, undefined otherwise)
    $next: DataNode | undefined;         // linked list towards the next version (undefined if last of the list)   
    $new: (forCopy: boolean) => DataNode;// factory function to create a new instance of the current DataNode
    $copyProps: (DataNode) => void;      // copy the properties of the data node to another data node
    $updateParentRefs: (previousParent: DataNode) => void; // update all data node properties so that they use 
    $computeDependencies: any;           // object set during the processing of a computed property - undefined otherwise
    $initMode: boolean;                  // true when we are in the init call stack
    $log(depth: number, out?: string[], idOffset?: number): string; // return debug information to trace the datanode structure
    // the current data node as parent in place of previousParent
}

interface HObject extends DataNode {
    $json: Object;    // associated json object to support lazy-load from a json structure - only set when created from json
    $vProps: string[] | undefined;  // e.g. ["value"] - defined at prototype level in generated code
    $dProps: string[] | undefined;
    $vProps2: string[] | undefined; // e.g. ["$$value"] - defined at prototype level in generated code
    $dProps2: string[] | undefined;

    $copyProps(obj: HObject): void;
    $updateParentRefs(previousParent: HObject): void;
    $new(forCopy: boolean): HObject;
}

/**
 * Meta data object stored through $dmd reference on active (non immutable) DataNodes
 */
class DataNodeMetaData {
    parents: DataNode[] = [];                 // nodes that reference this node as direct child (graph must be a DAC)
    refreshNode: RefreshNode | undefined;     // link to the refresh node associated to this node - will be set when the node is 
    // changed and needs to be refreshed, will be removed when refreshed
    // or when one of its child node will be changed and added to the refresh list
    refreshPriority = 0;                      // number of child nodes that need to be refreshed before this node - priority 0 means that the node has to be refreshed first
    onFreeze: ((value) => any)[] | undefined; // list of callbacks that will be called when the object becomes immutable (cf. processChanges)
    watchers: ((any) => void)[] | undefined;  // list of watchers associated to a DataNode instance
}


/**
 * Internal property getter function
 * @param obj the DataNode object on which to get the property
 * @param $$propName the property name (should start with "$$" - e.g. "$$value")
 * @param propName [optional] the json data node property name - should only be set for data node properties. Same value as propName but without the $$ prefix
 * @param cf [optional] the constructor or factory associated with the property Object
 */
function $get<T>(obj: DataNode, $$propName, propName: string, cf?: Constructor<T> | Factory<T>, createDefault?: boolean): any {
    if (obj.$computeDependencies) {
        obj.$computeDependencies[propName] = true;
    }
    if (propName && cf && obj["$json"]) {
        // init object from json structure
        let json = obj["$json"];
        if (json.data) {
            let target = obj, $$value: any = undefined;
            if (obj.$next) {
                // object is now immutable
                if (obj[$$propName] !== undefined) {
                    // prop has already been set
                    return obj[$$propName];
                }
                // as object is immutable and as value has never been set on this object
                // we get the value from the last version
                target = latestVersion(target);
            }
            target = target.$mn || target;

            if (target[$$propName] === undefined) {
                // first time this property is retrieved
                let newCount = (--json.count), // a new property is read
                    jsonValue = json.data[propName];
                if (newCount === 0) {
                    // delete $json.data reference as all dn props have been read
                    json.data = undefined;
                    target["$json"] = undefined;
                }
                if ((jsonValue === undefined || jsonValue === null) && !createDefault) {
                    $$value = null;
                } else {
                    $$value = create(<any>cf, jsonValue);
                    // connect to parent
                    connectChildToParent(target, $$value);
                }
                target[$$propName] = $$value;
            }

            if ($$value !== undefined) {
                if (obj.$next) {
                    // push new value to all next versions
                    let nd = obj, c = 0;
                    while (obj.$next && c < MAX_ITERATION) {
                        obj[$$propName] = $$value;
                        obj = obj.$next;
                        c++;
                    }
                    if (c === MAX_ITERATION) {
                        console.error("Hibe error: Max Iteration reached on dataset get");
                    }
                    if (obj.$mn) {
                        obj.$mn[$$propName] = $$value;
                    }
                }
                return $$value
            }
        }
    }
    if (createDefault && cf) {
        let target = obj.$mn || obj;
        if (target[$$propName] === undefined) {
            let $$value = create(<any>cf);
            connectChildToParent(obj, $$value as any);
            target[$$propName] = $$value;
        }
    }
    return (obj.$mn) ? obj.$mn[$$propName] : obj[$$propName];
}

/**
 * Internal property setter function
 * @param obj the DataNode on which to set the property
 * @param $$propName the name or index of the property (should start with "$$" - e.g. "$$value")
 * @param newValue the new property value (will be compared to current value)
 * @param cf [optional] the constructor or factory associated with the property Object
 * @param propHolder the name of the property holding all properties (e.g. for DatList) - optional
 */
function $set<T>(obj: DataNode, $$propName: string | number, newValue: any, cf?: Constructor<T> | Factory<T>, propHolder?: string | undefined) {
    let isDataset = cf && ((<any>cf).$dsFactory || (<any>cf).prototype && (<any>cf).prototype["$dsFactory"]);
    if (NEW_MODE) {
        // this call happens in a dataset constructor (otherwise the NEW_MODE would be false)
        if (isDataset) {
            if (!obj.$initMode) {
                let pn = $$propName;
                if (typeof $$propName === "string") {
                    pn = $$propName.substring(2);
                }
                console.log("[Hibe] dataset property initialization should be done through init() and not in constructor - please check " + obj.$className + "/" + pn);
                return;
            }
        } else {
            // default prop setter are generated in the constructor so we have to accept them
            obj[$$propName] = newValue;
            return;
        }
    }
    if (obj.$computeDependencies) {
        console.error("[Hibe] Computed properties must not mutate the Dataset state when calculated");
        return;
    }
    if (obj.$next) {
        console.error("[Hibe] Cannot update property '" + $$propName + "' on an immutable item");
        return;
    }
    if (isDataset && newValue && newValue.$kind !== DATASET) {
        if ((<any>cf).$createProxy) {
            let v = (<any>cf).$createProxy(newValue);
            if (v) {
                newValue = v;
            } else {
                isDataset = false;
            }
        }
    }
    let updateVal = false, currentValue: any;
    if (obj.$mn) {
        // object has already been changed
        updateVal = true;
    } else {
        currentValue = getPropValue(obj, $$propName, propHolder);
        if (currentValue !== newValue) {
            touch(obj, true);
            updateVal = true;
        }
    }
    if (updateVal) {
        if (isDataset && !propHolder && newValue === undefined) {
            // undefined is used to determine when the property has never been set (cf. get when a json object is set for lazy load)
            newValue = null;
        }
        if (isDataset || (currentValue && currentValue.$kind === DATASET)) {
            updateSubDataNodeRef(obj, getPropValue(obj.$mn!, $$propName, propHolder) as DataNode, newValue as DataNode);
        }
        setPropValue(obj.$mn!, $$propName, newValue, propHolder);
    }
}

function getPropValue(obj: DataNode, propName: string | number, propHolder?: string) {
    let h = propHolder ? obj[propHolder] : obj;
    if (h instanceof Map) {
        return h.get(propName);
    } else {
        return h[propName];
    }
}

function setPropValue(obj: DataNode, propName: string | number, propValue: any, propHolder?: string) {
    let h = propHolder ? obj[propHolder] : obj;
    if (h instanceof Map) {
        return h.set(propName, propValue);
    } else {
        return h[propName] = propValue;
    }
}

/**
 * Return the dmd associated a data node (or null if the data node is immutable)
 * Automatically create a DataNodeMetaData instance if the data node is not immutable and dmd doesn't exist
 * @param d the data node to retrieve the dmd from
 * @param errContext error context to log in case of error (e.g. method name)
 */
function retrieveDmd(d: DataNode, errContext: string): DataNodeMetaData | null {
    let dmd = d.$dmd;
    if (dmd) {
        return dmd;
    } else {
        if (d.$next) {
            console.error("Hibe error: Cannot update an immutable object [" + errContext + "]");
            return null;
        } else {
            // create a new Dmd
            return d.$dmd = new DataNodeMetaData();
        }
    }
}

/**
 * Update a child data node parent ref when a new version of the parent is created
 * Return the new child value
 * @param child 
 * @param currentParent 
 * @param newParent 
 */
function updateParentRef(child: DataNode | null, currentParent: DataNode, newParent: DataNode) {
    if (child && child.$kind === DATASET) {
        child = child.$next || child;
        if (child) {
            // replace one parent ref with new ref
            let dmd = retrieveDmd(child, "updateParentRef");
            if (dmd) {
                let p = dmd.parents, idx = p.indexOf(currentParent);
                if (idx > -1) {
                    p.splice(idx, 1, newParent);
                }
            }
        }
    }
    return child;
}

/**
 * Recursively mark a node and its parent as changed (i.e. create a mutable next object on them)
 * @param d the data node to mark as changed
 * @param selfChange true if the call is triggered by a change of a direct property, false otherwise (i.e. when in recursive call)
 * @return true if d has been touched for the first time
 */
function touch(d: DataNode, selfChange: boolean) {
    // return true if the node was touched, false if it was already touched (i.e. marked as modified in the current update round)
    let dmd = retrieveDmd(d, "touch"), firstTimeTouch = true;
    if (dmd) {
        if (d.$mn) {
            // node already modified
            firstTimeTouch = false;
        } else {
            // create a new mutable next
            let mNext = d.$new(true);
            d.$mn = mNext;

            // init mn with current property values
            d.$copyProps(mNext);
        }

        if (selfChange) {
            refreshContext.ensureRefresh(d);
        } else {
            // change is triggered by a child reference that will hold the refreshNode
            refreshContext.increaseRefreshPriority(d);
        }
        if (firstTimeTouch) {
            // recursively touch on parent nodes
            if (dmd.parents.length) {
                for (let p of dmd.parents) {
                    touch(p, false);
                }
            }
        }
    }
}

/**
 * Copy a list of properties from a src object to a dest object
 * Note: properties are not removed from the src object
 * @param propNames 
 * @param src 
 * @param dest 
 */
function copyProps(propNames: string[] | undefined | null, src, dest) {
    if (propNames) {
        let idx = propNames.length, nm: string;
        while (idx--) {
            nm = propNames[idx];
            if (dest[nm] !== undefined || src[nm] !== undefined) {
                dest[nm] = src[nm];
            }
        }
    }
}

/**
 * Update the child references of a data node when a child reference changes
 * (i.e. add/remove dataNode from child parents collection)
 * @param dataNode 
 * @param currentChild 
 * @param newChild 
 */
function updateSubDataNodeRef(dataNode: DataNode, currentChild: DataNode | null, newChild: DataNode | null) {
    // remove parent ref from old ref
    disconnectChildFromParent(dataNode, currentChild);
    // add parent ref to new ref
    connectChildToParent(dataNode, newChild);
}

/**
 * Disconnect a child node from its parent
 * (i.e. remove the parent from the child parents collection)
 * @param parent 
 * @param child 
 */
function disconnectChildFromParent(parent: DataNode, child: DataNode | null) {
    if (child) {
        // if child is immutable, it last version still holds the reference to the current parent
        child = latestVersion(child);
        let dmd = retrieveDmd(child, "disconnectChildFromParent");
        if (dmd) {
            let p = dmd.parents, idx = p.indexOf(parent);
            if (idx > -1) {
                p.splice(idx, 1);
            }
            if (isMutating(child)) {
                refreshContext.decreaseRefreshPriority(parent);
            }
        }
    }
}

/**
 * Connect a child node to a new parent
 * (i.e. add the parent from the child parents collection)
 * @param parent 
 * @param child 
 */
function connectChildToParent(parent: DataNode, child: DataNode | null) {
    if (child) {
        child = latestVersion(child);
        let dmd = retrieveDmd(child, "connectChildToParent");
        if (dmd) {
            dmd.parents.push(parent); // note parent can be referenced multiple times if there are multiple links

            if (isMutating(child)) {
                // parent will be refreshed after the child
                refreshContext.increaseRefreshPriority(parent);
            }
        }
    }
}

function preventChangeOnFrozenObject(d: DataNode, location: string = ""): boolean {
    if (d.$next) {
        console.error("Hibe error: immutable objects cannot be updated [" + location + "]");
        return true;
    }
    return false;
}

/**
 * Watch all changes associated to a data node instance
 * @param d  the data node to watch
 * @param fn the function to call when the data node changes (the new data node version will be passed as argument)
 * @return the watch function that can be used as identifier to un-watch the object (cf. unwatch)
 */
export function watch(d: any, fn: (any) => void): ((any) => void) {
    d = latestVersion(d);
    let dmd = retrieveDmd(d, "watch");
    if (dmd) {
        if (!dmd.watchers) {
            dmd.watchers = [fn];
        } else {
            dmd.watchers.push(fn);
        }
    }
    return fn;
}

/**
 * Stop watching a data node
 * @param d the targeted data node
 * @param watchFn the watch function that should not be called any longer (returned by watch(...))
 */
export function unwatch(d: any, watchFn: ((any) => void) | null) {
    d = latestVersion(d);
    if (d.$dmd && watchFn) {
        let w = d.$dmd.watchers;
        if (w) {
            d.$dmd.watchers = w.filter((f) => f !== watchFn);
        }
    }
}

/**
 * Create a dataset instance from a JSON object that use the same key-values as the data set properties
 * The data will actually be lazy-loaded so that the json object object will only be read when the
 * equivalent property is read on the data node instance
 * Note: the returned dataset will be initialized with the json data and will be considered as mutable, with no on-going mutations
 * @param c the Dataset constructor (i.e. class reference)
 * @param json the json data to feed in the data node
 * @return the new dataset instance
 */
function create<T>(c: Constructor<T> | Factory<T>, json?: Object): T {
    let d: any, $new: any = c["$new"];
    if ($new) {
        d = (<any>c).$new(); // c is a factory
    } else {
        if ((<any>c).prototype.$kind !== DATASET) {
            console.error("Hibe error: constructor argument doesn't correspond to a Dataset");
        }
        d = (<any>c).prototype.$new(false);
    }

    if (json) {
        // copy stProps from json to target if object has simple type props
        let stProps = d.$vProps;
        if (stProps) {
            let idx = stProps.length, stProps2 = d.$vProps2;
            while (idx--) {
                d[stProps2[idx]] = json[stProps[idx]];
            }
        }
        // store json ref as $json if object supports dynamic props
        if (d.$dProps && d.$dProps.length) {
            // the counter is used to automatically de-reference the json data when all data nodes properties
            // have been read
            d["$json"] = { data: json, count: d.$dProps.length };
        } else if (d.$acceptsJson) {
            d["$json"] = { data: json };
        }
    }
    return d;
}

export function load<T>(json: Object, c: Constructor<T> | Factory<T>) {
    return create(c, json);
}


export interface JSConversionContext {
    UNDEFINED: {},
    simpleTypeProps(): string[];
    datasetProps(): string[];
    getPropValue(propName): any;
    getDefaultConversion(): any;
    getPreviousConversion(): any;
}

export interface JSConverter {
    (obj: any, cc: JSConversionContext): any;
}

function convertFactory() {
    let processedNodes: any[] = [],
        stack: any[] = [],
        ds: any,
        currentConverter: JSConverter | undefined;

    let cc: JSConversionContext = {
        UNDEFINED: {},
        simpleTypeProps() {
            return ds.$vProps || [];
        },
        datasetProps() {
            return ds.$dProps || [];
        },
        getPropValue(propName) {
            if (ds.$json) {
                let ad = (ds.$mn) ? ds.$mn : ds, $$prop = "$$" + propName, json = ds.$json.data;
                if (ad[$$prop] === undefined && json[propName] !== undefined) {
                    return json[propName]; // note: this is not a data node!
                } else {
                    return ad[$$prop];
                }
            }
            return (ds.$mn) ? ds.$mn["$$" + propName] : ds["$$" + propName];
        },
        getDefaultConversion() {
            return defaultConverter(ds, cc);
        },
        getPreviousConversion() {
            return ds.$toJS;
        }
    }

    function defaultConverter(o, cc: JSConversionContext) {
        let pc = cc.getPreviousConversion();
        if (pc) {
            return pc; // use the same conversion if the object has already been converted (avoid infinite loops)
        }
        let res, cr;
        if (o.$convert) {
            res = o.$convert(currentConverter);
        } else {
            res = {};
            copyProps(cc.simpleTypeProps(), o, res);
            let dnProps = cc.datasetProps(), idx = dnProps.length, nm, val;
            while (idx--) {
                nm = dnProps[idx];
                val = cc.getPropValue(nm);
                cr = convert2JS(val, currentConverter);
                if (cr !== undefined && cr !== cc.UNDEFINED) {
                    res[nm] = cr;
                }
            }
        }

        return res;
    }

    function convert2JS(d: any, converter?: JSConverter): any {
        let isFirst = (processedNodes.length === 0), result: any = d;

        if (d && d.$kind === DATASET) {
            processedNodes.push(d);

            result = undefined;
            stack.push(d);
            ds = d;
            if (converter) {
                currentConverter = converter;
                result = converter(d, cc);
            } else {
                result = defaultConverter(d, cc);
            }
            d.$toJS = result;
            stack.pop();
            ds = stack[stack.length - 1];
        }

        if (isFirst) {
            // remove $toJS prop on all nodes
            let idx = processedNodes.length;
            while (idx--) {
                processedNodes[idx]["$toJS"] = undefined;
            }
            // cleanup context variables
            ds = null;
            processedNodes = [];
            currentConverter = undefined;
        }
        return result;
    }
    return convert2JS;
}

export const convert = convertFactory();

// -----------------------------------------------------------------------------------------------------------------------------
// Refresh classes

/**
 * Refresh linked list: contains all 'start' nodes that need to be processed/refreshed
 */
class RefreshNode {
    next: RefreshNode | undefined;
    prev: RefreshNode | undefined;
    dataNode: DataNode | undefined;
    ctxt: RefreshContext | undefined;

    constructor(dn: DataNode) {
        this.dataNode = dn;
    }
}

/**
 * Data Node watcher
 */
interface DnWatcher {
    dataNode: DataNode;
    cbList: ((DataNode) => void)[];
}

/**
 * Context holding a linked list of nodes that need to be refreshed
 */
class RefreshContext {
    first: RefreshNode | undefined;
    last: RefreshNode | undefined;

    /**
     * Get a refresh node from the pool (or create a new one) and initialize it
     * @param dn the DataNode to associate to the refresh node
     */
    add(dn: DataNode): RefreshNode {
        let rn = refreshPool.pop();
        if (!rn) {
            rn = new RefreshNode(dn);
        } else {
            rn.dataNode = dn;
        }

        rn.prev = rn.next = undefined;
        rn.ctxt = this;
        if (!this.first) {
            this.first = this.last = rn;
            Promise.resolve().then(() => { this.refresh() });
        } else {
            // add last
            let last = this.last!;
            last.next = rn;
            rn.prev = last;
            this.last = rn;
        }
        return rn;
    }


    /**
     * Release and reset a refresh node. Set it back to the refresh node pool
     * @param rn the RefreshNode to release
     */
    release(rn: RefreshNode) {
        if (rn.ctxt !== this) {
            return;
        }
        let dn = rn.dataNode!.$next || rn.dataNode, dmd = dn!.$dmd!; // latestVersion(rn.dataNode)
        dmd.refreshNode = undefined;
        // warning: refreshDependencies may be > 0 when node is removed from list when a child takes precedence
        rn.dataNode = undefined;
        if (rn.prev) {
            if (rn.next) {
                rn.prev.next = rn.next;
                rn.next.prev = rn.prev;
            } else {
                // rn is last
                rn.prev.next = undefined;
                this.last = rn.prev;
            }
        } else if (rn.next) {
            // the node should be first
            if (this.first === rn) {
                this.first = rn.next;
            }
            rn.next.prev = undefined;
        } else {
            // both prev and next are null: this node should be the only node in the list
            if (this.first === rn) {
                this.first = this.last = undefined;
            }
        }
        rn.ctxt = rn.prev = rn.next = undefined; // release all references
        refreshPool.push(rn);
    }

    /**
     * Ensure a data node will be refreshed
     * @param d 
     */
    ensureRefresh(d: DataNode) {
        let dmd = d.$dmd;
        if (dmd && dmd.refreshPriority === 0 && !dmd.refreshNode) {
            dmd.refreshNode = this.add(d);
        }
    }

    /**
     * Increase the refresh priority of a data node
     * @param d
     */
    increaseRefreshPriority(d: DataNode) {
        let dmd = d.$dmd;
        if (dmd) {
            dmd.refreshPriority++;
            if (dmd.refreshNode) {
                // priority is no more 0 so if node was in the refresh list we should remove it
                dmd.refreshNode.ctxt!.release(dmd.refreshNode);
                dmd.refreshNode = undefined;
            }
        }
    }

    /**
     * Decrease the refresh priority of a data node
     * E.g. when a child node has been refreshed
     * @param d the data node
     */
    decreaseRefreshPriority(d: DataNode) {
        let dmd = d.$dmd;
        if (dmd) {
            let rd = --dmd.refreshPriority;
            if (rd == 0) {
                // add to refresh list
                dmd.refreshNode = this.add(d);
            }
        }
    }

    /**
     * Decrease the refresh priority of a data node list
     * @param d the data node
     */
    decreaseRefreshPriorityOnList(list: DataNode[]) {
        if (list) {
            for (let d of list) {
                this.decreaseRefreshPriority(d);
            }
        }
    }

    /**
     * Refresh all the data nodes associated to the current context
     */
    refresh() {
        let ctxt = this;

        if (!ctxt.first) {
            console.error("Hibe error: refresh list should not be empty");
            return;
        }
        refreshContext = new RefreshContext();

        let d: DataNode, parents: DataNode[], rd, nextNext, keepGoing = true, next = ctxt.first, instanceWatchers: DnWatcher[] = [], tempWatchers: DnWatcher[] = [];

        // create new versions
        while (keepGoing) {
            if (!next) {
                keepGoing = false;
            } else {
                d = next.dataNode!;
                d = d.$next || d;
                processNode(d, instanceWatchers, tempWatchers);
                d = d.$next!;
                ctxt.decreaseRefreshPriorityOnList(d.$dmd!.parents);
                nextNext = next.next;
                ctxt.release(next);
                if (nextNext) {
                    next = nextNext;
                } else {
                    if (next === ctxt.first) {
                        keepGoing = false;
                    } else {
                        next = ctxt.first;
                    }
                }
            }
        }
        if (ctxt.first) {
            // some node could not be refreshed: we have a circular dependency
            console.error("Hibe error: some node could not be properly refreshed because of a circular dependency");
        }

        // notify all instance watchers (generated through calls to watch(...))
        callWatchers(instanceWatchers);
        // notify all temporary watchers (generated through calls to processingDone(...))
        callWatchers(tempWatchers);
    }
}

function processNode(d: DataNode, instanceWatchers: DnWatcher[], tempWatchers: DnWatcher[]) {
    // add a new version at the end of the $next linked list
    let dmd = d.$dmd!, cbList = dmd.onFreeze;
    dmd.onFreeze = undefined; // remove current callbacks
    let mNext = d.$mn!;
    d.$next = mNext;
    d.$mn = undefined;
    d.$next.$dmd = dmd;
    d.$dmd = undefined;
    mNext.$updateParentRefs(d);
    d = d.$next;
    if (dmd.watchers) {
        instanceWatchers.push({ dataNode: d, cbList: dmd.watchers });
    }
    if (cbList) {
        tempWatchers.push({ dataNode: d, cbList: cbList });
    }
}

function callWatchers(watchers: DnWatcher[]) {
    let cbList;
    for (let w of watchers) {
        cbList = w.cbList;
        for (let cb of cbList) {
            cb(w.dataNode);
        }
    }
}

// list of all nodes that need to be refreshed
let refreshContext: RefreshContext = new RefreshContext(),
    refreshPool: RefreshNode[] = [];

// -----------------------------------------------------------------------------------------------------------------------------
// List classes

const ARRAY_MUTATION_METHODS = ["push", "pop", "shift", "unshift", "splice"];

class HList<T> implements DataNode {
    $kind: "DATASET" = DATASET;        // to easily identify a data node
    $className = "HList";                // class name
    $id: number;
    $dmd: DataNodeMetaData | undefined;  // meta-data used to track changes - only set on last version (cf.$next)
    $mn: HList<T> | undefined;           // current mutable $next (set if node is being changed, undefined otherwise)
    $next: HList<T> | undefined;         // linked list towards the next version (undefined if last of the list)   
    $computeDependencies: any;           // object set during the processing of a computed property - undefined otherwise
    $initMode = false;                   // true when we are in the init call stack
    $acceptsJson = true;
    $itemFactory: Factory<T>;
    $$list: any[];
    $json: any;
    $dsFactory = true;
    $log = log;
    $isProxy = false;

    static $newProxy(itemFactory) {
        return new Proxy([], new HList(itemFactory));
    }

    constructor(itemFactory: Factory<T>) {
        this.$id = dsId();
        this.$itemFactory = itemFactory;
    }

    $activeList(): any[] {
        // initialize the object from the $json property, if any - cf. create(...)
        this.$initFromJson();
        return this.$mn ? this.$mn!.$$list : this.$$list;
    }

    $new(): HList<T> {
        return HList.$newProxy(this.$itemFactory);
    }

    /**
     * Create a proxy around an existing array
     */
    $createProxy(arr: any) {
        if (Array.isArray(arr)) {
            let p = new Proxy(arr, new HList(this.$itemFactory));
            let idx = arr.length;
            touch(p, true);
            while (idx--) {
                connectChildToParent(p, arr[idx]);
            }
            return p;
        }
        return null;
    }

    $convert(converter?: JSConverter) {
        // o is a list
        let res: any[] = [], arr = this.$activeList(), idx = arr.length;
        while (idx--) {
            res[idx] = convert(arr[idx], converter);
        }
        return res;
    }

    /**
     * Create a new Item and store it in the list
     * @param index [optional] the index where to store the item - default = list length. If negative, the item will be created but not stored in the list
     */
    $newItem(index?: number): T {
        let itm = (<any>this).$itemFactory.$new();
        if (index === undefined) {
            index = this.$$list.length;
        }
        if (index > -1) {
            if (preventChangeOnFrozenObject(<any>this, "DataList.$newItem")) return itm;
            $set(this, index, itm, this.$itemFactory, "$$list");
        }
        return itm;
    }

    $copyProps(o: HList<T>): void {
        o.$$list = this.$$list.slice(0); // clone
    }

    $updateParentRefs(previousParent: HList<T>) {
        let ls = this.$$list, idx = ls.length, itm;
        while (idx--) {
            itm = ls[idx];
            if (itm && itm.$kind === DATASET) {
                ls[idx] = updateParentRef(<DataNode | null>itm, <any>previousParent, <any>this);
            }
        }
    }

    $initFromJson() {
        if (this.$json) {
            let l = (this.$json.data) as any[];
            if (l.constructor !== Array) {
                console.error("[Hibe error] DataLists can only be initialized from JSON Arrays");
            } else {
                let idx = l.length, itm, $$list: any[] = this.$$list, $itemFactory: Factory<Object> = this.$itemFactory, dsFactory = $itemFactory.$dsFactory;
                while (idx--) {
                    itm = l[idx];
                    if (itm) {
                        if (dsFactory) {
                            $$list[idx] = create($itemFactory, itm);
                        } else {
                            $$list[idx] = itm;
                        }
                    } else if (itm === null) {
                        $$list[idx] = null;
                    }
                }
            }
            this.$json = undefined;
        }
    }

    /**
     * Dispose the current HList so that all items dont have any backward reference to it
     * The HList shall not be used after calling this function
     * @return the array of list items
     */
    $dispose(): any[] {
        let al = this.$activeList(), idx = al.length;
        while (idx--) {
            disconnectChildFromParent(<any>this, al[idx]);
        }
        return al;
    }

    $toString() {
        return "Hibe List [" + this.$activeList().join(", ") + "]";
    }

    /**
     * Proxy handler method called on each property set
     * @param target the list array (cf. listProxy() factory)
     * @param prop the property name
     * @param value the value
     */
    set(target, prop: string, value: any) {
        if (!this.$$list) {
            this.$$list = target;
        }
        this.$initFromJson();
        if (prop.match(RX_INT)) {
            // prop is an integer
            $set(this, parseInt(prop, 10), value, this.$itemFactory, "$$list");
        } else if (prop.match(RX_H_PROP)) {
            // prop starts with a $
            this[prop] = value;
        }
        return true;
    }

    /**
     * Proxy handler method called on each property get
     * @param target the list array (cf. listProxy() factory)
     * @param prop the property name
     */
    get(target, prop) {
        if (!this.$$list) {
            this.$$list = target;
        }
        if (prop === "$isProxy") {
            return true;
        }
        let tp = typeof prop
        if (tp === "string") {
            if (prop.match(RX_H_PROP)) {
                return this[prop];
            } else if (prop.match(RX_INT)) {
                // prop is an integer
                return this.$activeList()[parseInt(prop, 10)];
            } else if (prop === "length") {
                return this.$activeList().length;
            } else if (prop === "push") {
                // optimized implementation of push
                return function push(this: any, ...items: any[]) {
                    const self = this; // this will be the proxy object
                    if (preventChangeOnFrozenObject(self, "DataList.push")) return;
                    let sz = items.length, ln = self.$activeList().length; // cf. get length
                    for (let i = 0; sz > i; i++) {
                        self.set(target, (ln + i) + "", items[i]);
                    }
                }
            } else if (prop === "toString") {
                return this.$toString;
            } else if (typeof target[prop] === "function") {
                // default implementation for any all functions
                // more optimized methods can be implemented on a case by case - cf. push
                return function (this: any) {
                    const self = this; // this will be the proxy object
                    let isMutationFn = ARRAY_MUTATION_METHODS.indexOf(prop) > -1;
                    if (!self.$mn && isMutationFn) {
                        // need a clone
                        touch(self, true)
                    }
                    if (isMutationFn) {
                        let items = self.$mn!.$$list;
                        // detach old children
                        for (let i = 0; items.length > i; i++) {
                            disconnectChildFromParent(self, items[i]);
                        }
                    }
                    let ls = self.$activeList();
                    let result = ls[prop].apply(ls, arguments);
                    if (isMutationFn) {
                        let items = self.$mn!.$$list;
                        // attach new children
                        for (let i = 0; items.length > i; i++) {
                            connectChildToParent(self, items[i]);
                        }
                    }
                    return result;
                }
            }
        }
        if (prop === Symbol.iterator) {
            return this.$activeList()[Symbol.iterator];
        }
        return this[prop];
    }
}

interface ArrayProxy<T> extends Array<T>, Factory<ArrayProxy<T>> {
    $newItem(index?: number): T;
    $dispose(): T[];
    $log(depth?: number, out?: string[], idOffset?: number);
}

/**
 * Return a new list of cf items that is also a factory to create new lists of cf items
 * @param cf list item Constructor or Factory object
 */
export function list<T>(cf: Constructor<T> | Factory<T>): ArrayProxy<T> {
    createNewFactory(cf);
    return HList.$newProxy(cf as any);
}

function createNewFactory<T>(cf: Constructor<T> | Factory<T>) {
    if (!cf["$new"]) {
        if (typeof cf === "function") {
            cf["$new"] = function () {
                return new cf();
            }
            cf["$dsFactory"] = (cf.prototype.$dsFactory === true);
        } else {
            console.log("Hibe error: invalid constructor or factory\n" + cf);
            cf["$new"] = function () {
                return {} as any;
            }
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------
// Map classes

class HMap<K, V> implements DataNode {
    $kind: "DATASET" = DATASET;        // to easily identify a data node
    $id: number;
    $className = "HMap";                // class name
    $dmd: DataNodeMetaData | undefined;  // meta-data used to track changes - only set on last version (cf.$next)
    $mn: HMap<K, V> | undefined;              // current mutable $next (set if node is being changed, undefined otherwise)
    $next: HMap<K, V> | undefined;            // linked list towards the next version (undefined if last of the list)   
    $computeDependencies: any;           // object set during the processing of a computed property - undefined otherwise
    $initMode = false;                   // true when we are in the init call stack
    $acceptsJson = true;
    $itemFactory: Factory<V>;
    $$map: Map<any, any>;
    $json: any;
    $dsFactory = true;
    $log = log;
    $isProxy = false;

    static $newProxy(itemFactory) {
        return new Proxy(new Map(), new HMap(itemFactory));
    }

    constructor(itemFactory: Factory<V>) {
        this.$id = dsId();
        this.$itemFactory = itemFactory;
    }

    $activeMap(): Map<any, any> {
        // initialize the object from the $json property, if any - cf. create(...)
        this.$initFromJson();
        return this.$mn ? this.$mn.$$map : this.$$map;
    }

    $new(): HMap<K, V> {
        return HMap.$newProxy(this.$itemFactory);
    }

    /**
     * Create a proxy around an existing array
     */
    $createProxy(m: any) {
        if (m.forEach && m.entries) {
            let p = new Proxy(m, new HMap(this.$itemFactory));
            touch(p, true);
            m.forEach((item) => {
                connectChildToParent(p, item);
            });
            return p;
        }
        return null;
    }

    $convert(converter?: JSConverter) {
        // o is a list
        let m = this.$activeMap(), res = {};
        m.forEach((item, key) => {
            res[key] = convert(item, converter);
        });
        return res;
    }

    $initFromJson() {
        if (this.$json) {
            let o = (this.$json.data) as any[];
            if (typeof o !== "object") {
                console.error("[Hibe error] DataMaps can only be initialized from JSON objects");
            } else {
                let itm: any, $$map = this.$$map, $itemFactory: Factory<Object> = this.$itemFactory, dsFactory = $itemFactory.$dsFactory;
                for (let k in o) {
                    if (o.hasOwnProperty(k)) {
                        itm = o[k];
                        if (itm) {
                            if (dsFactory) {
                                $$map.set(k, create($itemFactory, itm));
                            } else {
                                $$map.set(k, itm);
                            }
                        }
                    }
                }
            }
            this.$json = undefined;
        }
    }

    /**
     * Create a new Item and store it in the dictionary
     * @param key the key where to store the item 
     * @return the new item
     */
    $newItem(key: K): V {
        let itm = (<any>this).$itemFactory.$new();
        if (preventChangeOnFrozenObject(<any>this, "DataMap.$newItem")) return itm;
        this.$set(key, itm);
        return itm;
    }

    $copyProps(o: HMap<K, V>): void {
        o.$$map = new Map(this.$$map); // clone
    }

    $updateParentRefs(previousParent: HMap<K, V>) {
        let m = this.$$map;
        m.forEach((item, key) => {
            let v = updateParentRef(<DataNode | null>item, <any>previousParent, <any>this);
            if (v !== item) {
                m.set(key, v);
            }
        });
    }

    /**
     * Dispose the current HMap so that all items dont have any backward reference to it
     * The HMap shall not be used after calling this function
     * @return a JS object containing all dictionary items
     */
    $dispose() {
        let m = this.$activeMap();
        m.forEach((item) => {
            disconnectChildFromParent(<any>this, item);
        });
        return m;
    }

    $set(key: any, item: any): any {
        this.$initFromJson();
        $set(<any>this, key, item, this.$itemFactory, "$$map");
        return this;
    }

    $get(key: any): any {
        return this.$activeMap()!.get(key);
    }

    $delete(key): boolean {
        let m = this.$activeMap();
        if (m.has(key)) {
            this.$set(key, null);
            return this.$activeMap().delete(key);
        }
        return false;
    }

    $clear() {
        let m = this.$activeMap();
        if (m.size > 0) {
            m.forEach((item, key) => {
                this.$set(key, null);
            });
            this.$activeMap().clear();
        }
    }

    $toString() {
        return "Hibe Map [size:" + this.$activeMap().size + "]";
    }

    /**
     * Proxy handler method called on each property set
     * @param target the list array (cf. listProxy() factory)
     * @param prop the property name
     * @param value the value
     */
    set(target, prop: string, value: any) {
        if (!this.$$map) {
            this.$$map = target;
        }
        if (prop.match(RX_H_PROP)) {
            // prop starts with a $
            this[prop] = value;
        }
        return true;
    }

    /**
     * Proxy handler method called on each property get
     * @param target the list array (cf. listProxy() factory)
     * @param prop the property name
     */
    get(target, prop) {
        if (!this.$$map) {
            this.$$map = target;
        }
        if (prop === "$isProxy") {
            return true;
        }
        let tp = typeof prop
        if (tp === "string") {
            if (prop.match(RX_H_PROP)) {
                return this[prop]
            } else if (prop === "set") {
                return this.$set;
            } else if (prop === "get") {
                return this.$get;
            } else if (prop === "delete") {
                return this.$delete;
            } else if (prop === "clear") {
                return this.$clear;
            } else if (prop === "toString") {
                return this.$toString;
            } else if (typeof target[prop] === "function") {
                let m = this.$activeMap();
                return m[prop].bind(m);
            } else {
                let m = this.$activeMap();
                return m![prop];
            }

        }
        return this[prop];
    }
}

interface MapProxy<K, V> extends Map<K, V>, Factory<Map<K, V>> {
    $newItem(key: K): V;
    $dispose(): Map<K, V>;
    $log(depth?: number, out?: string[], idOffset?: number);
}

export function map<K, V>(cf: Constructor<V> | Factory<V>): MapProxy<K, V> {
    createNewFactory(cf);
    return HMap.$newProxy(cf as any);
}
