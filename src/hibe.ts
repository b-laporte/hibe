import { processLengthCounter } from './test/testnodes';


const DATANODE = "DATANODE", FACTORY = "FACTORY";
let NEW_MODE = false, COPY_MODE = false; // global variable to bypass the setters during constructor call

/**
 * Dataset decorator
 * Mark dataset classes and transform them to support all necessary features
 * @param c the dataset constructor
 */
export function Dataset(c: any) {
    let proto = c.prototype, idx: number;

    patchIntoHObject(proto);

    class Dataset extends c {
        constructor(...args) {
            let prevMode = NEW_MODE;
            NEW_MODE = true;
            super();
            this.$debugId = DEBUG_ID_COUNT++;
            if (!COPY_MODE && this.init) {
                this.$initMode = true;
                this.init();
                this.$initMode = false;
            }
            NEW_MODE = prevMode;
        }
    };
    proto.$className = c.name;

    function $new(forCopy = false) {
        let prevMode = COPY_MODE;
        COPY_MODE = forCopy;
        let o = new Dataset();
        COPY_MODE = prevMode;
        return o;
    }
    $new["$kind"] = FACTORY;
    $new["$outputsDataNode"] = true;
    proto.$new = $new;

    return Dataset as any;
};

/**
 * Fills a proto info structure with some more property description
 * @param proto the proto info structure
 * @param propName name of the property
 * @param isDataNode true if the property is a datanode
 */
function addPropertyInfo(proto: any, propName: string, defaultValue: any, isDataNode: boolean, desc: PropertyDescriptor | undefined) {
    let nm1 = isDataNode ? "$dnProps" : "$stProps",
        nm2 = isDataNode ? "$dnProps2" : "$stProps2";
    if (!proto[nm1]) {
        proto[nm1] = [];
        proto[nm2] = [];
    } else if (!proto.hasOwnProperty(nm1)) {
        // we are in a sub-class of a dataset -> copy the proto arrays
        proto[nm1] = proto[nm1].slice(0);
        proto[nm2] = proto[nm2].slice(0);
    }
    proto[nm1].push(propName);
    proto[nm2].push("$$" + propName);
    proto["$$" + propName] = defaultValue;
    if (desc && delete proto[propName]) {
        Object.defineProperty(proto, propName, desc);
    }
}

/**
 * Simple type property decorator factory
 */
function stProperty(defaultValue?: any) {
    return function () {
        return function (proto, key: string) {
            // proto = object prototype
            // key = the property name (e.g. "value")
            let $$key = "$$" + key;
            addPropertyInfo(proto, key, defaultValue, false, {
                get: function () { return get(<any>this, $$key, key); },
                set: function (v) { set(<any>this, $$key, v, 0); },
                enumerable: true,
                configurable: true
            });
        };
    };
}

function dnProperty<T>(cf: Constructor<T> | Factory<T>, autoCreate?) {
    return function (proto, key: string) {
        // proto = object prototype
        // key = the property name (e.g. "value")
        let $$key = "$$" + key;
        if (autoCreate === undefined) {
            autoCreate = (cf["$kind"] === FACTORY); // will be true for List and Dictionary by default
        }
        addPropertyInfo(proto, key, undefined, true, {
            get: function () { return get(<any>this, $$key, key, cf, autoCreate); },
            set: function (v) { set(<any>this, $$key, v, 1); },
            enumerable: true,
            configurable: true
        });
    };
}

export let string = stProperty(""),
    number = stProperty(0),
    boolean = stProperty(false),
    object = stProperty(null),
    dataset = dnProperty;

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

/**
 * Tell if a mutation is ongoing on a given data node
 * @param o the data node to assert
 */
export function isMutating(o) {
    return o ? o.$mn !== undefined : false;
}

/**
 * Tell if a dataset instance has become immutable
 * @param o the data node to assert
 */
export function isImmutable(o) {
    return o.$next !== undefined;
}

/**
 * Tell if an object is a dataset
 * @param o 
 */
export function isDataset(o: any): boolean {
    return !!(o && o["$kind"] === DATANODE);
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

let MAX_ITERATION = 10000;
/**
 * Return the last version of a data node instance
 * @param dataNode 
 */
export function lastVersion<T>(dataNode: T): T {
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

/*
 * DataNode objects
 */
interface DataNode {
    $kind: "DATANODE";                   // to easily identify a data node
    $className: string;                       // class name
    $dmd: DataNodeMetaData | undefined;  // meta-data used to track changes - only set on last version (cf.$next)
    $mn: DataNode | undefined;           // current mutable $next (set if node is being changed, undefined otherwise)
    $next: DataNode | undefined;         // linked list towards the next version (undefined if last of the list)   
    $new: (forCopy: boolean) => DataNode;// factory function to create a new instance of the current DataNode
    $copyProps: (DataNode) => void;      // copy the properties of the data node to another data node
    $updateParentRefs: (previousParent: DataNode) => void; // update all data node properties so that they use 
    $computeDependencies: any;           // object set during the processing of a computed property - undefined otherwise
    $initMode: boolean;                  // true when we are in the init call stack
    // the current data node as parent in place of previousParent
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
function get<T>(obj: DataNode, $$propName, propName: string, cf?: Constructor<T> | Factory<T>, createDefault?: boolean): any {
    if (obj.$computeDependencies) {
        obj.$computeDependencies[propName] = true;
    }
    if (propName && cf && obj["$json"]) {
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
                target = lastVersion(target);
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
    if (createDefault) {
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
 * @param isDataNode 1 if the property is a DataNode, 0 otherwise
 * @param propHolder the name of the property holding all properties (e.g. for DatList) - optional
 */
function set(obj: DataNode, $$propName: string | number, newValue: any, isDataNode: number, propHolder?: string | undefined) {
    if (NEW_MODE) {
        // this call happens in a dataset constructor (otherwise the NEW_MODE would be false)
        if (isDataNode) {
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
    let updateVal = false;
    if (obj.$mn) {
        // object has already been changed
        updateVal = true;
    } else {
        let v = propHolder ? obj[propHolder]![$$propName] : obj[$$propName];
        if (v !== newValue) {
            touch(obj, true);
            updateVal = true;
        }
    }
    if (updateVal) {
        if (isDataNode && !propHolder && newValue === undefined) {
            // undefined is used to determine when the property has never been set (cf. get when a json object is set for lazy load)
            newValue = null;
        }
        if (propHolder) {
            if (isDataNode) {
                updateSubDataNodeRef(obj, obj.$mn![propHolder]![$$propName] as DataNode, newValue as DataNode);
            }
            obj.$mn![propHolder]![$$propName] = newValue;
        } else {
            if (isDataNode) {
                updateSubDataNodeRef(obj, obj.$mn![$$propName] as DataNode, newValue as DataNode);
            }
            obj.$mn![$$propName] = newValue;
        }
    }
}

/**
 * Watch all changes associated to a data node instance
 * @param d  the data node to watch
 * @param fn the function to call when the data node changes (the new data node version will be passed as argument)
 * @return the watch function that can be used as identifier to un-watch the object (cf. unwatch)
 */
export function watch(d: any, fn: (any) => void): ((any) => void) {
    d = lastVersion(d);
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
    d = lastVersion(d);
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
export function create<T>(c: Constructor<T> | Factory<T>, json?: Object): T {
    let d: any;
    if (c["$kind"] === FACTORY) {
        d = (c as Function)();
    } else {
        if (c.prototype.$kind !== DATANODE) {
            console.error("Hibe error: constructor argument doesn't correspond to a Dataset");
        }
        d = (<any>c).prototype.$new(false);
    }

    if (json) {
        // copy stProps from json to target if object has simple type props
        let stProps = d.$stProps;
        if (stProps) {
            let idx = stProps.length, stProps2 = d.$stProps2;
            while (idx--) {
                d[stProps2[idx]] = json[stProps[idx]];
            }
        }
        // store json ref as $json if object supports dynamic props
        if (d.$dnProps && d.$dnProps.length) {
            // the counter is used to automatically de-reference the json data when all data nodes properties
            // have been read
            d["$json"] = { data: json, count: d.$dnProps.length };
        } else if (d.$acceptsJson) {
            d["$json"] = { data: json };
        }
    }
    return d;
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
            return ds.$stProps || [];
        },
        datasetProps() {
            return ds.$dnProps || [];
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
        if (o.constructor === HList) {
            // o is a list
            res = [];
            let arr = o.toArray(), idx = arr.length;
            while (idx--) {
                res[idx] = convert2JS(arr[idx], currentConverter);
            }
        } else if (o.constructor === HDictionary) {
            // o is a dictionary
            res = {};
            let keys = o.keys, idx = keys.length, k;
            while (idx--) {
                k = keys[idx];
                res[k] = convert2JS(o.get(k), currentConverter);
            }
        } else {
            res = {};
            copyProps(cc.simpleTypeProps(), o, res);
            let dnProps = cc.datasetProps(), idx = dnProps.length, nm, val;
            while (idx--) {
                nm = dnProps[idx];
                val = cc.getPropValue(nm);
                cr = convert2JS(val, currentConverter);
                if (cr !== undefined) {
                    res[nm] = (cr === cc.UNDEFINED) ? undefined : cr;
                }
            }
        }

        return res;
    }

    function convert2JS(d: any, converter?: JSConverter): any {
        let isFirst = (processedNodes.length === 0), result: any = d;

        if (d && d.$kind === "DATANODE") {
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

export const convert2JS = convertFactory();




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
            dest[nm] = src[nm];
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
        child = lastVersion(child);
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
export function connectChildToParent(parent: DataNode, child: DataNode | null) {
    if (child) {
        child = lastVersion(child);
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
    if (child) {
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

// -----------------------------------------------------------------------------------------------------------------------------
// DataNode classes

let DEBUG_ID_COUNT = 1;

/**
 * Patch a dataset prototype to transform it into an HObject
 * @param proto a Dataset prototype
 */
function patchIntoHObject(proto: any) {
    proto.$kind = "DATANODE";
    proto.$copyProps = $copyProps;
    proto.$updateParentRefs = $updateParentRefs;
}

function $copyProps(this: HObject, obj: HObject) {
    copyProps(this.$stProps2, this, obj);
    copyProps(this.$dnProps2, this, obj);
    obj.$json = this.$json;
}

function $updateParentRefs(this: HObject, previousParent: HObject) {
    let dnProps = this.$dnProps2;
    if (dnProps) {
        let idx = dnProps.length, nm: string;
        while (idx--) {
            nm = dnProps[idx];
            this[nm] = updateParentRef(this[nm], previousParent, this);
        }
    }
}

interface HObject {
    $kind: "DATANODE";
    $className: string;
    $dmd: DataNodeMetaData | undefined;
    $json: Object;    // associated json object to support lazy-load from a json structure - only set when created from json
    $stProps: string[] | undefined;  // e.g. ["value"] - defined at prototype level in generated code
    $dnProps: string[] | undefined;
    $stProps2: string[] | undefined; // e.g. ["$$value"] - defined at prototype level in generated code
    $dnProps2: string[] | undefined;
    $next: HObject | undefined;
    $mn: HObject | undefined;
    $computeDependencies: any[] | undefined;
    $initMode: boolean;

    $copyProps(obj: HObject): void;
    $updateParentRefs(previousParent: HObject): void;
    $new(forCopy: boolean): HObject;
}

function preventChangeOnFrozenObject(d: DataNode, location: string = ""): boolean {
    if (d.$next) {
        console.error("Hibe error: immutable objects cannot be updated [" + location + "]");
        return true;
    }
    return false;
}


interface Constructor<T> {
    new(): T;
}

interface CollectionConstructor<T> {
    new(itemFactory: Factory<T>): T;
}

interface Factory<T> {
    $kind: "FACTORY";
    $outputsDataNode?: true;
    (json?: Object): T;
}

export interface List<T> {
    length: number;
    set(index: number, item: T | null): T | null;
    get(index: number): T | null;
    newItem(index?: number): T;
    push(...items: T[]): void;
    forEach(cb: (item: T, index?: number, dataList?: List<T>) => void, cbThis?): void;
    filter(cb: (item: T, index?: number, dataList?: List<T>) => boolean, cbThis?): T[];
    filterItems(cb: (item: T, index?: number, dataList?: List<T>) => boolean, cbThis?): this;
    indexOf(searchElement: any, fromIndex?: number): number;
    splice(start: number, deleteCount: number | undefined, ...items: T[]): void;
    toArray(): T[];
    toString(): string;
    dispose(): T[];
}

export function hList<T>(cf: Constructor<T> | Factory<T>): Factory<List<T>> {
    let fName = "$HListFactory";
    return cf[fName] || collectionFactory(cf, HList, fName);
}

function collectionFactory<T>(cf: Constructor<T> | Factory<T>, cc: CollectionConstructor<T>, factoryName: string): Factory<List<T>> {
    // factoryName: e.g. "$HListFactory"
    // cc: e.g. HList
    // the result of this function will be memoized on cf through a $HListFactory property
    let r;
    if (cf["$kind"] === FACTORY) {
        let c = cf as Factory<T>;

        // cf is a factory
        r = function () {
            return new cc(c);
        }
    } else {
        // cf is a constructor
        let c = cf as Constructor<T>, f: any = c["$factory"];
        if (!f) {
            // data node have a factory on their prototype - cf. statics(...)
            if ((f = c.prototype.$new) === undefined) {
                c["$factory"] = f = function () { return new c(); };
                f.$kind = FACTORY;
            }
        }
        r = function () { return new cc(f); }
    }
    r.$kind = FACTORY;
    r.$outputsDataNode = true;
    cf[factoryName] = r;
    return r;
}

class HList<T> implements List<T> {
    // WARNING:
    // the following properties are defined dynamically in the constructor or in the prototype below 
    // in order to be hidden in user code auto-completion (TypeScript will not )

    // $kind: "DATANODE" = "DATANODE";
    // $debugId: number;    // internal unique id to ease debugging (should be removed)
    // $dmd: DataNodeMetaData | undefined;
    // $mn: List<T> | undefined;
    // $next: List<T> | undefined;
    // $itemFactory: Factory<T>; // item factory
    // $$list: (T | null)[] = [];
    // $json
    // $acceptsJson = true;

    constructor(itemFactory: Factory<T>) {
        (<any>this).$debugId = DEBUG_ID_COUNT++;
        (<any>this).$$list = [];
        (<any>this).$itemFactory = itemFactory;
    }

    get length(): number {
        return activeList(this).length;
    }

    set(index: number, item: T | null): T | null {
        initList(this);
        set(<any>this, index, item, (<any>this).$itemFactory.$outputsDataNode ? 1 : 0, "$$list");
        return item;
    }

    get(index: number): T | null {
        return activeList(this)[index] || null;
    }

    /**
     * Create a new Item and store it in the list
     * @param index [optional] the index where to store the item - default = list length. If negative, the item will be created but not stored in the list
     */
    newItem(index?: number): T {
        let itm = (<any>this).$itemFactory();
        if (index === undefined) {
            index = this.length;
        }
        if (index > -1) {
            if (preventChangeOnFrozenObject(<any>this, "List.newItem")) return itm;
            this.set(index, itm);
        }
        return itm;
    }

    push(...items: T[]) {
        if (preventChangeOnFrozenObject(<any>this, "List.push")) return;
        let sz = items.length, ln = this.length; // cf. get length
        for (let i = 0; sz > i; i++) {
            this.set(ln + i, items[i]);
        }
    }

    forEach(cb: (item: T, index?: number, dataList?: List<T>) => void, cbThis?) {
        let list = activeList(this);
        list.forEach((item, index) => {
            cb.call(cbThis, item, index, this);
        });
    }

    filter(cb: (item: T, index?: number, dataList?: List<T>) => boolean, cbThis?): T[] {
        let list = activeList(this),
            lsFiltered = list.filter((item, index, arr) => {
                return cb.call(cbThis, item, index, this);
            }, cbThis);
        return lsFiltered;
    }

    /**
     * Remove the items that don't meet a certain condition
     * Note: the list will be mutated if one item is removed
     * @param cb a callback function that should return something that evaluates to true if the items is to be kept
     * @param cbThis the callback "this" context
     */
    filterItems(cb: (item: T, index?: number, dataList?: List<T>) => boolean, cbThis?): this {
        let list = activeList(this), hasChanged = false;

        let lsFiltered = list.filter((item, index, arr) => {
            let condition = cb.call(cbThis, item, index, this);
            if (!condition) {
                // this item will be removed
                disconnectChildFromParent(this as any, item as any);
                hasChanged = true;
            }
            return condition;
        }, cbThis);

        if (hasChanged) {
            touch(this as any, true);
            this["$mn"]!.$$list = lsFiltered;
        }

        return this;
    }

    indexOf(searchElement: any, fromIndex?: number): number {
        let ls = activeList(this);
        return ls.indexOf(searchElement, fromIndex);
    }

    splice(start: number, deleteCount: number | undefined = undefined, ...items: T[]) {
        if (preventChangeOnFrozenObject(<any>this, "List.splice")) return;
        // adapt inputs according to array specs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice
        let list = activeList(this);

        let len = list.length;
        if (start > len) {
            start = len;
            deleteCount = 0;
        } else if (start < 0) {
            start = len + start;
            if (start < 0) {
                start = 0;
            }
        }
        if (deleteCount === undefined || deleteCount > len - start) {
            deleteCount = len - start;
        } else if (deleteCount < 0) {
            deleteCount = 0;
        }

        if (deleteCount > 0 || items.length > 0) {
            touch(<any>this, true);

            let item;
            // disconnect children
            for (let i = 0; deleteCount > i; i++) {
                item = list[start + i];
                if (item) {
                    disconnectChildFromParent(<any>this, item);
                }
            }
            // connect new children
            for (let i = 0; items.length > i; i++) {
                item = items[i];
                if (item) {
                    connectChildToParent(<any>this, item);
                }
            }
            // update list
            (<any>this).$mn!.$$list.splice(start, deleteCount, ...items);
        }
    }

    /**
     * Shallow copy of the current active list
     */
    toArray(): T[] {
        return activeList(this).slice(0);
    }

    toString() {
        return activeList(this).join(",");
    }

    /**
     * Dispose the current list so that all items dont have any backward reference to it
     * The list shall not be used after calling this function
     * @return the array of list items
     */
    dispose() {
        let al = activeList(this), idx = al.length, itm;
        while (idx--) {
            itm = al[idx];
            if (isDataset(itm)) {
                disconnectChildFromParent(<any>this, itm);
            }
        }
        return al;
    }
}

function activeList<T>(ls: HList<T>): [T] {
    // initialize the object from the $json property, if any - cf. create(...)
    initList(ls);
    return (<any>ls).$mn ? (<any>ls).$mn.$$list : (<any>ls).$$list;
}

function initList<T>(ls: HList<T>) {
    if (ls["$json"]) {
        let l = (ls["$json"].data) as any[];
        if (l.constructor !== Array) {
            console.error("[Hibe error] List can only be initialized from JSON Arrays");
        } else {
            let idx = l.length, itm, $$list: any[] = ls["$$list"], $itemFactory: Factory<Object> = ls["$itemFactory"], $outputsDataNode = $itemFactory.$outputsDataNode;
            while (idx--) {
                itm = l[idx];
                if (itm) {
                    if ($outputsDataNode) {
                        $$list[idx] = create($itemFactory, itm);
                    } else {
                        $$list[idx] = itm;
                    }
                } else if (itm === null) {
                    $$list[idx] = null;
                }
            }
        }
        ls["$json"] = undefined;
    }
}

HList.prototype["$kind"] = DATANODE;

HList.prototype["$className"] = "HList";

HList.prototype["$acceptsJson"] = true; // to be able to get $json through create(...)

HList.prototype["$new"] = function <T>(): HList<T> {
    return new HList<T>((<any>this).$itemFactory);
}

HList.prototype["$copyProps"] = function <T>(obj: HList<T>) {
    obj["$$list"] = (<any>this).$$list.slice(0); // clone
}

HList.prototype["$updateParentRefs"] = function <T>(previousParent: HList<T>) {
    let ls = (<any>this).$$list, idx = ls.length, itm;
    while (idx--) {
        itm = ls[idx];
        if (itm && itm.$kind === DATANODE) {
            ls[idx] = <T | null>updateParentRef(<DataNode | null>itm, <any>previousParent, <any>this);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------
// Dictionary classes

export interface Dictionary<T> {
    size: number;
    isEmpty: boolean;
    keys: string[];
    newItem(key: string): T;
    // elements -> any[]
    put(key: string, item: T | null): T | null;
    get(key: string): T | null;
    remove(key: string): void;
    toObject(): {};
    toString(): string;
    dispose(): {};
}

export function hDictionary<T>(cf: Constructor<T> | Factory<T>): Factory<Dictionary<T>> {
    let fName = "$HDictFactory";
    return cf[fName] || collectionFactory(cf, HDictionary, fName);
}


class HDictionary<T> implements Dictionary<T> {
    // WARNING:
    // the following properties are defined dynamically in the constructor or in the prototype below 
    // in order to be hidden in user code auto-completion

    // $kind: "DATANODE" = "DATANODE";
    // $debugId: number;    // internal unique id to ease debugging (should be removed)
    // $dmd: DataNodeMetaData | undefined;
    // $mn: List<T> | undefined;
    // $next: List<T> | undefined;
    // $itemFactory: Factory<T>; // item factory
    // $$dict: any = {};
    // $$keys: string[] = []
    // $json
    // $acceptsJson = true;

    constructor(itemFactory: Factory<T>) {
        (<any>this).$debugId = DEBUG_ID_COUNT++;
        (<any>this).$$dict = {};
        (<any>this).$$keys = [];
        (<any>this).$itemFactory = itemFactory;
    }

    get size(): number {
        let keys = activeDict(this).$$keys;
        return keys ? keys.length : 0;
    }

    get isEmpty(): boolean {
        return this.size === 0;
    }

    get keys(): string[] {
        let keys = activeDict(this).$$keys;
        return keys ? keys.slice(0) : [];
    }

    put(key: string, item: T | null | undefined): T | null {
        initDict(this);
        let isNewKey = !activeDict(this).$$dict.hasOwnProperty(key);
        set(<any>this, key, item, (<any>this).$itemFactory.$outputsDataNode ? 1 : 0, "$$dict");

        let ad = activeDict(this); // ad may have changed
        if (item !== undefined) {
            if (isNewKey) {
                ad.$$keys.push(key);
            }
        } else {
            if (!isNewKey && ad.$$keys) {
                // remove from $$keys collection and reduce size
                let idx = ad.$$keys.indexOf(key);
                if (idx > -1) {
                    ad.$$keys.splice(idx, 1);
                }
            }
            delete ad.$$dict[key];
        }
        return item ? item : null;
    }

    get(key: string): T | null {
        return activeDict(this).$$dict[key] || null;
    }

    remove(key: string): void {
        this.put(key, undefined);
    }

    /**
     * Create a new Item and store it in the dictionary
     * @param key the key where to store the item 
     * @return the new item
     */
    newItem(key: string): T {
        let itm = (<any>this).$itemFactory();
        if (preventChangeOnFrozenObject(<any>this, "Dictionary.newItem")) return itm;
        this.put(key, itm);
        return itm;
    }

    toObject(): {} {
        return Object.assign({}, activeDict(this).$$dict); // clone
    }

    toString(): string {
        return "[Hibe Dictionary (" + this.size + ")]";
    }

    /**
     * Dispose the current dictionary so that all items dont have any backward reference to it
     * The dictionary shall not be used after calling this function
     * @return a JS object containing all dictionary items
     */
    dispose() {
        let ad = activeDict(this).$$dict, keys = this.keys, idx = keys.length, itm;
        while (idx--) {
            itm = ad[keys[idx]];
            if (isDataset(itm)) {
                disconnectChildFromParent(<any>this, itm);
            }
        }
        return ad;
    }
}

HDictionary.prototype["$kind"] = DATANODE;

HDictionary.prototype["$className"] = "HDictionary";

HDictionary.prototype["$acceptsJson"] = true; // to be able to get $json through create(...)

HDictionary.prototype["$new"] = function <T>(): HDictionary<T> {
    return new HDictionary<T>((<any>this).$itemFactory);
}

HDictionary.prototype["$copyProps"] = function <T>(obj: HDictionary<T>) {
    // clone dict and keys into the new object
    obj["$$dict"] = Object.assign({}, (<any>this).$$dict); // clone
    obj["$$keys"] = (<any>this).$$keys.slice(0); // clone
}

HDictionary.prototype["$updateParentRefs"] = function <T>(previousParent: HDictionary<T>) {
    let d = (<any>this).$$dict, keys = (<any>this).$$keys;
    if (keys.length) {
        let idx = keys.length, itm, k;
        while (idx--) {
            k = keys[idx];
            itm = d[k];
            if (itm && itm.$kind === DATANODE) {
                d[k] = <T | null>updateParentRef(<DataNode | null>itm, <any>previousParent, <any>this);
            }
        }
    }
}

function initDict<T>(d: HDictionary<T>) {
    if (d["$json"]) {
        let o = (d["$json"].data) as any[];
        if (typeof o !== "object") {
            console.error("[Hibe error] Dictionaries can only be initialized from JSON objects");
        } else {
            let itm, $$keys = d["$$keys"], $$dict: any = d["$$dict"], $itemFactory: Factory<Object> = d["$itemFactory"], $outputsDataNode = $itemFactory.$outputsDataNode;
            for (let k in o) {
                if (o.hasOwnProperty(k)) {
                    itm = o[k];
                    if (itm) {
                        if ($outputsDataNode) {
                            $$dict[k] = create($itemFactory, itm);
                        } else {
                            $$dict[k] = itm;
                        }
                    } else if (itm === null) {
                        $$dict[k] = null;
                    }
                    $$keys.push(k);
                }
            }
        }
        d["$json"] = undefined;
    }
}

function activeDict<T>(dict: HDictionary<T>): any {
    // initialize the object from the $json property, if any - cf. create(...)
    initDict(dict);
    return (<any>dict).$mn ? (<any>dict).$mn : dict;
}

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
        let dn = rn.dataNode!.$next || rn.dataNode, dmd = dn!.$dmd!; // lastVersion(rn.dataNode)
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
