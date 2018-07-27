import * as assert from 'assert';
import { TestNode, StNode, defaultObject, initNewArrTestNode, DictTestNode } from "./testnodes";
import { isMutating, mutationComplete, convert2JS, JSConversionContext, create } from '../hibe';

describe('Convert2JS', () => {

    it("should support default conversion for simple type properties", async function () {
        let sn = new StNode();

        assert.deepEqual(convert2JS(sn), {
            isOK: true,
            isOK2: false,
            message: "hello",
            message2: "",
            quantity: 42,
            quantity2: 0,
            someObject: defaultObject,
            someObject2: null
        }, "toJS works on new objects");

        sn.message2 = "m2";
        assert.equal(isMutating(sn), true, "sn is mutating");
        assert.deepEqual(convert2JS(sn), {
            isOK: true,
            isOK2: false,
            message: "hello",
            message2: "m2",
            quantity: 42,
            quantity2: 0,
            someObject: defaultObject,
            someObject2: null
        }, "toJS works on mutating objects");

        sn = await mutationComplete(sn);
        assert.deepEqual(convert2JS(sn), {
            isOK: true,
            isOK2: false,
            message: "hello",
            message2: "m2",
            quantity: 42,
            quantity2: 0,
            someObject: defaultObject,
            someObject2: null
        }, "toJS works on changed objects");
    });

    it("should support conversion for datanode properties", async function () {
        let tn = new TestNode();

        assert.deepEqual(convert2JS(tn), {
            value: "v1"
        }, "toJS works on new objects");

        tn.node = new TestNode();
        tn.node.value = "v2";
        assert.equal(isMutating(tn), true, "tn is mutating");
        assert.equal(tn["$toJS"], undefined, "$toJS cleaned");

        assert.deepEqual(convert2JS(tn), {
            value: "v1",
            node: {
                value: "v2"
            }
        }, "toJS on mutating object");
        assert.equal(tn["$toJS"], undefined, "$toJS cleaned 2");

        tn = await mutationComplete(tn);
        assert.deepEqual(convert2JS(tn), {
            value: "v1",
            node: {
                value: "v2"
            }
        }, "toJS on mutated object");
        assert.equal(tn["$toJS"], undefined, "$toJS cleaned 3");
    });

    it("should not convert the same node twice with converter", async function () {
        let tn1 = new TestNode(), tn2 = new TestNode(), tn3 = new TestNode();
        tn2.value = "v2";
        tn3.value = "v3";
        tn1.node = tn2;
        tn2.node = tn3;
        tn2.node2 = tn3;

        let jsNd = convert2JS(tn1);
        assert.deepEqual(jsNd, {
            value: "v1",
            node: {
                value: "v2",
                node: {
                    value: "v3"
                },
                node2: {
                    value: "v3"
                }
            }
        }, "toJS on mutating object");
        assert.strictEqual(jsNd.node.node, jsNd.node.node2, "same v3 object");

        assert.equal(isMutating(tn1), true, "tn1 is mutating");

        tn1 = await mutationComplete(tn1);
        jsNd = convert2JS(tn1);
        assert.deepEqual(jsNd, {
            value: "v1",
            node: {
                value: "v2",
                node: {
                    value: "v3"
                },
                node2: {
                    value: "v3"
                }
            }
        }, "toJS on mutating object (2)");
        assert.strictEqual(jsNd.node.node, jsNd.node.node2, "same v3 object (2)");
    });

    it("should support custom converters", async function () {
        let tn1 = new TestNode(), tn2 = new TestNode(), tn3 = new TestNode();
        tn2.value = "v2";
        tn3.value = "v3";
        tn1.node = tn2;
        tn2.node = tn3;
        tn2.node2 = tn3;

        function c(o: any, cc: JSConversionContext) {
            if (o.constructor === TestNode) {
                if (o.value === "v3") {
                    return "tn3";
                } else if (o.value === "v2") {
                    let r = cc.getDefaultConversion();
                    r.isV2 = true;
                    return r;
                } else {
                    return cc.getDefaultConversion();
                }
            }
        }

        assert.deepEqual(convert2JS(tn1, c), {
            value: "v1",
            node: {
                value: "v2",
                isV2: true,
                node: "tn3",
                node2: "tn3"
            }
        }, "conversion on mutating object");

        tn1 = await mutationComplete(tn1);
        assert.deepEqual(convert2JS(tn1, c), {
            value: "v1",
            node: {
                value: "v2",
                isV2: true,
                node: "tn3",
                node2: "tn3"
            }
        }, "conversion on mutating object");
    });

    it("should ignore nodes through custom converters", async function () {
        let tn1 = new TestNode(), tn2 = new TestNode(), tn3 = new TestNode();
        tn2.value = "v2";
        tn3.value = "v3";
        tn1.node = tn2;
        tn2.node = tn3;
        tn2.node2 = tn3;

        function c(o: any, cc: JSConversionContext) {
            if (o.constructor === TestNode) {
                if (o.value === "v3") {
                    return undefined;
                } else {
                    return cc.getDefaultConversion();
                }
            }
            return undefined;
        }

        assert.deepEqual(convert2JS(tn1, c), {
            value: "v1",
            node: {
                value: "v2"
            }
        }, "conversion on mutating object");

        tn1 = await mutationComplete(tn1);
        assert.deepEqual(convert2JS(tn1, c), {
            value: "v1",
            node: {
                value: "v2"
            }
        }, "conversion on mutating object");
    });

    it("should ignore be able to set a node undefined through custom converters", async function () {
        let tn1 = new TestNode(), tn2 = new TestNode(), tn3 = new TestNode();
        tn2.value = "v2";
        tn3.value = "v3";
        tn1.node = tn2;
        tn2.node = tn3;
        tn2.node2 = tn3;

        function c(o: any, cc: JSConversionContext) {
            if (o.constructor === TestNode) {
                if (o.value === "v3") {
                    return cc.UNDEFINED;
                } else {
                    return cc.getDefaultConversion();
                }
            }
            return undefined;
        }

        assert.deepEqual(convert2JS(tn1, c), {
            value: "v1",
            node: {
                value: "v2",
                node: undefined,
                node2: undefined
            }
        }, "conversion on mutating object");

        tn1 = await mutationComplete(tn1);
        assert.deepEqual(convert2JS(tn1, c), {
            value: "v1",
            node: {
                value: "v2",
                node: undefined,
                node2: undefined
            }
        }, "conversion on changed object");
    });

    it("should convert lists", async function () {
        let nd = initNewArrTestNode();

        assert.deepEqual(convert2JS(nd), {
            name: "no name",
            list: [{ value: "i1" }, { value: "i2" }, { value: "i3" }]
        }, "conversion on mutating object");

        nd = await mutationComplete(nd);
        assert.deepEqual(convert2JS(nd), {
            name: "no name",
            list: [{ value: "i1" }, { value: "i2" }, { value: "i3" }]
        }, "conversion on changed object");

    });

    it("should convert dictionaries", async function () {
        let d = new DictTestNode();
        d.dict.newItem("a").value = "item A";
        d.dict.newItem("b").value = "item B";

        assert.deepEqual(convert2JS(d), {
            name: "map",
            dict: { a: { value: "item A" }, b: { value: "item B" } }
        }, "conversion on mutating object");

        d = await mutationComplete(d);
        assert.deepEqual(convert2JS(d), {
            name: "map",
            dict: { a: { value: "item A" }, b: { value: "item B" } }
        }, "conversion on changed object");
    });

    it("should return parts of original json when created through create", async function () {
        let json = { value: "v2", node: { value: "v3", node: { value: "v4" } } },
            tn = create(TestNode, json), tjs:any;

        assert.equal(isMutating(tn), false, "tn is not mutating");
        tjs = convert2JS(tn)
        assert.deepEqual(tjs, json, "tjs is equal to json");
        assert.strictEqual(tjs.node, json.node, "tjs.node is identical to json.node");

        tn.value = "v3";
        assert.equal(isMutating(tn), true, "tn is now mutating");
        assert.deepEqual(convert2JS(tn), {
            value: "v3",
            node: json.node
        }, "tjs is equal to json");
        assert.strictEqual(tjs.node, json.node, "tjs.node is identical to json.node (2)");

        tn.node = new TestNode();
        tn.node.value = "v4";

        tjs = convert2JS(tn);
        assert.deepEqual(tjs, {
            value: "v3",
            node: {
                value: "v4" // node doesn't show up as it has not been created
            }
        }, "tjs update");

        let tn2 = await mutationComplete(tn);
        assert.equal(tn2 !== tn, true, "tn2 is not tn");
        assert.equal(isMutating(tn2), false, "tn2 is not mutating");
        assert.deepEqual(convert2JS(tn2), {
            value: "v3",
            node: {
                value: "v4"
            }
        }, "tjs update after mutation");
    });


    // todo raise error when cycles are detected

});
