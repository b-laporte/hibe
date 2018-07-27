
// functions that are not necessary in hibe anymore as long as we don't have any rollup compiler

// /**
//  * Define static data for a data node
//  * @param c the data node constructor function (i.e. class reference)
//  * @param simpleTypeProp [optional] the list of simple type property names (i.e. strings, boolean, number)
//  * @param dataNodeProps [optional] the list of data node property names (List or node references)
//  * @param processedProps [optional] the list of the processed property names - e.g. ["listLength"]
//  */
// function statics(c: Function, simpleTypeProp: string[] | 0, dataNodeProps: string[] | 0, processedProps: string[] | 0) {
//     c.prototype.$kind = DATANODE;
//     generateStatics(c, "$stProps", "$stProps2", simpleTypeProp);
//     generateStatics(c, "$dnProps", "$dnProps2", dataNodeProps);
//     if (processedProps) {
//         c.prototype.$prProps = processedProps;
//     }
//     c.prototype.$new = function () {
//         return new (<any>c)();
//     }
//     c.prototype.$new.$kind = FACTORY;
//     c.prototype.$new.$outputsDataNode = true;
// }

// function generateStatics(c: Function, arrName: string, arrName2: string, propNames: string[] | 0) {
//     if (propNames) {
//         let idx = propNames.length, nm, arr2 = propNames.slice(0); // arr2 is a clone of propNames that contains the prop names prefixed with $$
//         while (idx--) {
//             arr2[idx] = "$$" + propNames[idx];
//         }
//         c.prototype[arrName] = propNames;
//         c.prototype[arrName2] = arr2;
//     }
// }

// class HObject implements DataNode {
//     $kind: "DATANODE" = "DATANODE";
//     $debugId: number;    // internal unique id to ease debugging (should be removed)
//     $dmd: DataNodeMetaData | undefined;
//     $json: Object;    // associated json object to support lazy-load from a json structure - only set when created from json
//     $stProps;  // e.g. ["value"] - defined at prototype level in generated code
//     $dnProps;
//     $stProps2; // e.g. ["$$value"] - defined at prototype level in generated code
//     $dnProps2;
//     $next: HObject | undefined;
//     $mn: HObject | undefined;
//     $computeDependencies = undefined;

//     constructor() {
//         this.$debugId = DEBUG_ID_COUNT++;
//     }

//     $copyProps = $copyProps;

//     $updateParentRefs = $updateParentRefs;

//     // WARNING: this method must be overridden in sub-classes
//     // don't use abstract method here to simplify sub-class code generation
//     $new() {
//         return new HObject();
//     }
// }

// /**
//  * Export methods that are used in the generated code
//  */
// export let __h = {
//     HObject: HObject,
//     set: set,
//     get: get,
//     statics: statics,
//     hList: hList
// }
