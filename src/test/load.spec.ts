import * as assert from 'assert';
import { TestNode, ArrTestNode, SimpleNode } from "./testnodes";
import { isMutating, mutationComplete, isImmutable, load, list, map } from '../hibe';

describe('Load', () => {

    it('should be supported with undefined data', async function () {
        let tn = load(undefined as any, TestNode);
        assert.equal(tn.value, "v1", "value has the right init value");
        assert.equal(isMutating(tn), false, "tn is not mutating");
    });

    it('should be supported with null data', async function () {
        let tn = load(null as any, TestNode);
        assert.equal(tn.value, "v1", "value has the right init value");
        assert.equal(isMutating(tn), false, "tn is not mutating");
    });

    it('should be supported to load simple type properties on data objects', async function () {
        let tn = load({ value: "init value" }, TestNode);
        assert.equal(tn.value, "init value", "value has the right init value");
        assert.equal(isMutating(tn), false, "tn is not mutating");

        tn.value = "v2";
        assert.equal(tn.value, "v2", "value has changed to v2");
        assert.equal(isMutating(tn), true, "tn is now mutating");
    });

    it('should be supported to load data node properties on data objects', async function () {
        let tn = load({ value: "v2", node: { value: "v3", node: { value: "v4" } } }, TestNode);
        assert.equal(tn.value, "v2", "value has the right init value");
        assert.equal(tn.node!.value, "v3", "tn.node.value has the right init value");
        assert.equal(tn.node!.node!.value, "v4", "tn.node.node.value has the right init value");

        assert.equal(isMutating(tn), false, "tn is not mutating");
        assert.equal(isMutating(tn.node), false, "tn.node is not mutating");
        assert.equal(isMutating(tn.node!.node), false, "tn.node.node is not mutating");
    });

    it('should remove link with $json object when all dn properties have been read', async function () {
        let json = { value: "v2", node: { value: "v3", node: { value: "v4" } } },
            tn = load(json, TestNode);

        assert.equal((tn as any).$json.data, json, "json not fully read (1)");
        assert.equal(tn.node!.value, "v3", "tn.node.value has the right init value");
        assert.equal((tn as any).$json.data, json, "json not fully read (2)");
        assert.equal(tn.node!.value, "v3", "tn.node.value has the right init value (2)");
        assert.equal((tn as any).$json.data, json, "json not fully read (3)");
        assert.equal(tn.node!.value, "v3", "tn.node.value has the right init value (3)");
        assert.equal(tn.node2, undefined, "tn.node2 is undefined");
        assert.equal((tn as any).$json, undefined, "json has been fully read and has been detached");
    });

    it('should not recreate a dataset that has been removed', async function () {
        let json = { value: "v2", node: { value: "v3", node: { value: "v4" } } },
            tn = load(json, TestNode);

        assert.equal(tn.node!.value, "v3", "tn.node.value has the right init value");
        assert.equal(tn.node2, undefined, "node2 is undefined as it has not been set");
        (<any>tn).node = undefined;

        assert.equal(tn.node, null, "node is null after having been set to undefined");
        assert.equal(isMutating(tn), true, "tn is mutating");

        tn = await mutationComplete(tn);
        assert.equal(tn.node, null, "node is null after having been set to undefined (2)");
    });

    it('should support null or undefined in the json data', async function () {
        let json = { value: "v2", node: null, node2: undefined },
            tn = load(json, TestNode);

        assert.equal(tn.node.value, "v1", "node has been automatically created as data is null");
        assert.equal(tn.node2, undefined, "node2 is undefined as it has not been set");
    });

    it('should property pass the $json reference to the new data node version', async function () {
        let json = { value: "v2", node: { value: "v3", node: { value: "v4" } }, node2: { value: "v5" } },
            tn = load(json, TestNode);

        // WARNING: debugger will call getter function and will reset the $json object!!!
        assert.equal((<any>tn).$json.data, json, "tn json is defined");
        assert.equal(tn.node!.value, "v3", "node prop is properly initialized");
        tn.value = "v2bis";

        let tn2 = await mutationComplete(tn);
        assert.equal(tn2.node2!.value, "v5", "node2 is loaded from the new tn version");
        assert.equal((<any>tn2).node2.$json.data, json.node2, "node2 $json.data is properly initialized ");
        assert.equal((<any>tn2).node2.$json.count, 2, "node2 $json.count is properly initialized ");
        assert.equal((<any>tn).$json.data, undefined, "tn json.data is no more defined as all dn props have been read");

        tn2.node!.value = "v3bis";
        let tn3 = await mutationComplete(tn2);
        assert.equal(tn3, (tn2 as any).$next, "tn3 is tn2 next");
        assert.equal(isImmutable(tn2), true, "tn2 is now immutable");

        // read node on the immutable object
        assert.equal((tn2 as any).node.$json["count"], 2, "json count is 2 as not dn prop has been read");
        assert.equal(tn2.node!.node!.value, "v4", "json can be loaded on an immutable object");
        assert.equal(tn2.node!.node, tn3.node!.node, "newly loaded node has been pushed to the next version");
        assert.equal((tn2 as any).node!.$json["count"], 1, "json count decreased to 1 on tn2");
        assert.equal((tn3 as any).node!.$json["count"], 1, "json count decreased to 1 on tn3");

        assert.equal(tn3.node!.node2, undefined, "node.node2 is undefined");
        assert.equal((tn2 as any).node!.$json["count"], 0, "json count decreased to 0 on tn2");
        assert.equal((tn2 as any).node!.$json["data"], undefined, "$json.data has been reset on tn2.node");
    });

    it('should support creating list from json arrays - length', async function () {
        let json, l = load(json = [{ value: "a" }, null, { value: "c" }], list(TestNode));

        assert.equal(l["$json"].data, json, "list $json has been properly initialized");
        assert.equal(l.length, 3, "correct length");
        assert.equal(isMutating(l), false, "list is not mutating");
    });

    it('should support creating list from json arrays - get', async function () {
        let l = load([{ value: "a" }, null, { value: "c" }], list(TestNode));

        assert.equal(l[0]!.value, "a", "item 0 value is a");
        assert.equal(l[1], null, "item 1 is null");
        assert.equal(l[2]!.value, "c", "item 2 value is c");
        assert.equal(isMutating(l), false, "list is not mutating");
    });

    it('should support creating list from json arrays - set new', async function () {
        let l = load([{ value: "a" }, null, { value: "c" }], list(TestNode));

        l.$newItem(3);
        assert.equal(l.length, 4, "length is 4");
        assert.equal(isMutating(l), true, "l is mutating");
        assert.equal(l[0]!.value, "a", "item 0 value is a");
        assert.equal(l[1], null, "item 1 is null");
        assert.equal(l[2]!.value, "c", "item 2 value is c");
        assert.equal(l[3]!.value, "v1", "item 3 value is v1");

        l = await mutationComplete(l);
        assert.equal(l.length, 4, "length is 4");
        assert.equal(isMutating(l), false, "l is mutating");
        assert.equal(l[0]!.value, "a", "item 0 value is a");
        assert.equal(l[1], null, "item 1 is null");
        assert.equal(l[2]!.value, "c", "item 2 value is c");
        assert.equal(l[3]!.value, "v1", "item 3 value is v1");
    });

    it('should support creating list from json arrays - set existing', async function () {
        let l = load([{ value: "a" }, null, { value: "c" }], list(TestNode));

        l.$newItem(0);
        assert.equal(l.length, 3, "length is 3");
        assert.equal(isMutating(l), true, "l is mutating");
        assert.equal(l[0]!.value, "v1", "item 0 value is v1");
        assert.equal(l[1], null, "item 1 is null");
        assert.equal(l[2]!.value, "c", "item 2 value is c");

        l = await mutationComplete(l);
        assert.equal(l.length, 3, "length is 3");
        assert.equal(isMutating(l), false, "l is mutating");
        assert.equal(l[0]!.value, "v1", "item 0 value is v1");
        assert.equal(l[1], null, "item 1 is null");
        assert.equal(l[2]!.value, "c", "item 2 value is c");
    });

    it('should support creating list of strings from json arrays - set existing', async function () {
        let l = load(["a", "b", null, "c", undefined, "d"], list(String));

        assert.equal(l.length, 6, "length is 6");
        assert.equal(l[0], "a", "0 is a");
        assert.equal(l[1], "b", "1 is b");
        assert.equal(l[2], null, "2 is null");
        assert.equal(l[3], "c", "3 is c");
        assert.equal(l[4], null, "4 is null");
        assert.equal(l[5], "d", "5 is d");
        assert.equal(isMutating(l), false, "l is not mutating");
    });

    // // todo: support @computed
    it('should support data list in data objects with computed properties', async function () {
        let an = load({ name: "an123", list: [{ value: "a" }, { value: "b" }] }, ArrTestNode);

        assert.equal(isMutating(an), false, "an is not mutating");
        assert.equal(an.name, "an123", "an.name is correct");

        assert.equal(an.listLength, 2, "listLength is 2");
        assert.equal(an.list.length, 2, "list length is 2");
        assert.equal(an.list[0]!.value, "a", "item 0 is a");
    });

    it('should load @object properties', async function () {
        let hello = { blah: "hello" },
            json = {
                node: { value: "v2" },
                data: { someValue: 1, someOtherValue: hello },
                subNode: {
                    data: { a: 123, b: hello }
                }
            }, sn = load(json, SimpleNode);

        let count = sn["$json"].count;
        assert.equal(sn.data.someValue, 1, "data is loaded");
        assert.equal(sn["$json"].count, count, "$json.count unchanged");
        assert.equal(sn.data.someOtherValue, hello, "hello is properly referenced");
        assert.equal(sn["$$subNode"], undefined, "subNode is not loaded yet");
        assert.equal(sn.subNode!.data.a, 123, "subNode and its data have been properly loaded");
        assert.deepEqual(sn.subNode!.data, { a: 123, b: hello }, "data is what it should be");
        sn.node;
        sn.list;
        assert.equal(sn["$json"], undefined, "$json released");
    });

    function getContent(it) {
        let arr: any[] = [];
        let itm = it.next();
        while (!itm.done) {
            arr.push(itm.value);
            itm = it.next();
        }
        return arr;
    }

    it('should support creating dictionaries of objects', async function () {
        let d = load({ a: { value: "a" }, c: { value: "c" } }, map(TestNode));

        assert.equal(d.size, 2, "d contains 2 items");
        assert.deepEqual(getContent(d.keys()), ["a", "c"], "a and c in keys");
        assert.equal(isMutating(d), false, "d is not mutating");
        assert.equal(d.get("a")!.value, "a", "a node correctly created");

        d.set("b", new TestNode());
        assert.equal(d.size, 3, "d contains 3 items");
        assert.deepEqual(getContent(d.keys()), ["a", "c", "b"], "a, b and c in keys");
        assert.equal(isMutating(d), true, "d is now mutating");

        d = await mutationComplete(d);
        assert.equal(d.size, 3, "d contains 3 items (2)");
        assert.deepEqual(getContent(d.keys()), ["a", "c", "b"], "a, b and c in keys (2)");
        assert.equal(isMutating(d), false, "d is no more mutating");
    });

    it('should support creating dictionaries of numbers', async function () {
        let d = load({ a: 1, c: 3, d: 4 }, map(Number));

        assert.equal(d.size, 3, "d contains 3 items");
        assert.deepEqual(getContent(d.keys()), ["a", "c", "d"], "a, c and d in keys");
        assert.equal(d.get("a"), 1, "a contains 1");

        d.set("b", 0);
        assert.equal(d.size, 4, "d contains 4 items");
        assert.equal(d.get("b"), 0, "0 in b");

        d = await mutationComplete(d);
        assert.equal(d.size, 4, "d contains 4 items (2)");
    });
});
