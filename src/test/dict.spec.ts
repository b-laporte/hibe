import * as assert from 'assert';
import { TestNode, DictTestNode } from "./testnodes";
import { hDictionary, isMutating, mutationComplete, lastVersion } from '../hibe';

describe('Dictionaries', () => {

    it("should be supported for Datasets", async function () {
        let d = hDictionary(TestNode)();

        assert.equal(d.size, 0, "size is 0");
        assert.equal(d.isEmpty, true, "d is empty");
        assert.equal(isMutating(d), false, "d is not mutating");

        let nd1 = new TestNode();
        d.put("nd", nd1);

        assert.equal(d.size, 1, "size is 1");
        assert.equal(d.isEmpty, false, "d is not empty");
        assert.equal(isMutating(d), true, "d is now mutating");
        assert.equal(d.get("nd"), nd1, "nd at right position");

        let d2 = await mutationComplete(d);
        assert.equal(d["$next"], d2, "d2 is next d version");
        assert.equal(isMutating(d2), false, "d2 is not mutating");
        assert.equal(d2.get("nd"), nd1, "nd1 still present in d2");
        assert.equal(nd1["$next"], undefined, "nd1 hasn't changed");

        nd1.value = "v2";

        assert.equal(isMutating(d2), true, "d2 is mutating after item update");
        assert.equal(d2.get("nd")!.value, "v2", "new value can be retrieved after change");

        let d3 = await mutationComplete(d2);
        assert.equal(d2["$next"], d3, "d3 is next d2 version");
        assert.equal(isMutating(d3), false, "d3 is not mutating");
        assert.equal(d3.get("nd"), (<any>nd1).$next, "nd1 next is referenced in d3");
    });

    it("should support string items", async function () {
        let d = hDictionary(String)();

        assert.equal(d.get("a"), null, "get null on undefined item");

        let s = d.put("a", "value a");
        assert.equal(s, "value a", "put returns the right value");
        assert.equal(d.size, 1, "size is 1");
        assert.equal(isMutating(d), true, "mutation started");

        d.put("b", "value b");
        assert.equal(d.size, 2, "size is now 2");

        let d2 = await mutationComplete(d);
        assert.equal(d["$next"], d2, "d2 is next d version");
        assert.equal(d2.get("a"), "value a", "a:value a");

        d2.put("a", "value a2");
        assert.equal(d2.size, 2, "size is still 2");
        assert.equal(d2.get("a"), "value a2", "a:value a2");

        let d3 = await mutationComplete(d2);
        assert.equal(d2["$next"], d3, "d3 is next d2 version");
        assert.equal(d3.size, 2, "size is still 2 (2)");
        assert.equal(d3.get("a"), "value a2", "a:value a2 (2)");
    });

    it('should properly items: nothing -> sthV2 -> sthV3 -> null -> null', async function () {
        let node10 = new DictTestNode();

        assert.equal(isMutating(node10), false, "node10 unchanged");
        let itemA = new TestNode();
        node10.dict = hDictionary(TestNode)();
        node10.dict.put("A", itemA);
        itemA.value = "vA";

        assert.equal(isMutating(node10), true, "node10 changed");
        let node11 = await mutationComplete(node10);
        assert.equal(isMutating(node11), false, "node11 unchanged");
        assert.equal(node11.dict.get("A")!.value, "vA", "dict.get('A').value is vA");
        assert.equal(node10.dict.size, 0, "node10.dict back to empty list");
        assert.equal(node11.dict.size, 1, "node11.dict has only one item");

        node11.dict.get("A")!.value = "vA2";
        let node12 = await mutationComplete(node11);
        assert.equal(node11.dict.get("A")!.value, "vA", "dict.get('A').value is back to vA");
        assert.equal(node12.dict.get("A")!.value, "vA2", "dict.get('A').value is now vA2");

        node12.dict.put("A", null);
        let node13 = await mutationComplete(node12);
        assert.equal(node12.dict.get("A")!.value, "vA2", "dict.get('A').value is back to vA2");
        assert.equal(node13.dict.get("A"), null, "node13 dict.get('A') is now null");
        assert.equal(node13.dict.size, 1, "node13 dict.size is still 1");

        node13.dict.put("A", null);
        assert.equal(isMutating(node13), false, "node13 unchanged");
        let node14 = await mutationComplete(node13);
        assert.equal(node14, node13, "no change on node14");
    });

    it('should support Dictionary.newItem', async function () {
        let dn = new DictTestNode();

        assert.equal(dn.dict.size, 0, "empty dictionary");
        let item = dn.dict.newItem("m");
        item.value = "item M";

        assert.equal(dn.dict.size, 1, "1 item in dictionary");
        assert.equal(dn.dict.get("m")!.value, "item M", "item m is item M");

        dn = await mutationComplete(dn);
        assert.equal(dn.dict.size, 1, "1 item list (2)");
        assert.equal(dn.dict.get("m")!.value, "item M", "item m is item M (2)");

        item = dn.dict.newItem("s");
        item.value = "item S";
        assert.equal(dn.dict.size, 2, "2 items in dictionary");
        assert.equal(dn.dict.get("s")!.value, "item S", "item S found");
    });

    it("should support newItem() and remove()", async function () {
        let dn = new DictTestNode();

        let nda = dn.dict.newItem("a");
        nda.value = "VA";
        let ndb = dn.dict.newItem("b");
        ndb.value = "VB";
        assert.equal(dn.dict.size, 2, "2 items");

        dn = await mutationComplete(dn);

        let nda2 = lastVersion(nda);
        assert.equal(dn.dict.size, 2, "2 items (2)");
        assert.equal(nda2, dn.dict.get("a"), "nda correctly updated");

        assert.deepEqual(nda2["$dmd"].parents, [dn.dict], "dn.dict is nda2 parent");

        dn.dict.remove("a");

        assert.equal(dn.dict.size, 1, "size is now 1");
        assert.equal(isMutating(dn), true, "dn is mutating");
        assert.equal(dn.dict.get("a"), null, "dict.get('a') returns null");

        dn = await mutationComplete(dn);
        assert.deepEqual(nda2["$dmd"].parents, [], "nda2 has no parents any more");
        assert.strictEqual(dn.dict["$$dict"]["a"], undefined, "nda2 has been removed from the $$dict map");

        dn.dict.put("a", nda2);

        dn = await mutationComplete(dn);
        assert.equal(dn.dict.size, 2, "size is now 2");
        assert.equal(isMutating(dn), false, "dn is not mutating");
        assert.equal(dn.dict.get("a"), nda2, "dict.get('a') returns nda2");
        assert.deepEqual(nda2["$dmd"].parents, [dn.dict], "nda2 has one parent again");
        assert.strictEqual(dn.dict["$$dict"]["a"], nda2, "nda2 is in $$dict map");
    });

    it("should support keys retrieval", async function () {
        let dn = new DictTestNode();

        assert.deepEqual(dn.dict.keys, [], "keys is empty");
        assert.equal(isMutating(dn.dict), false, "not mutating after keys retrieval");

        let nda = dn.dict.newItem("a");
        assert.deepEqual(dn.dict.keys, ["a"], "keys contains a");

        dn = await mutationComplete(dn);
        assert.deepEqual(dn.dict.keys, ["a"], "keys contains a (2)");

        dn.dict.newItem("b");
        assert.deepEqual(dn.dict.keys, ["a", "b"], "keys contains a and b");

        dn = await mutationComplete(dn);
        assert.deepEqual(dn.dict.keys, ["a", "b"], "keys contains a and b (2)");

        dn.dict.put("a", nda);
        assert.deepEqual(dn.dict.keys, ["a", "b"], "keys contains a and b (3)");
        assert.equal(isMutating(dn), false, "setting the same item in the list didn't trigger a change");

        dn.dict.remove("a");
        assert.deepEqual(dn.dict.keys, ["b"], "keys contains b only");

        dn = await mutationComplete(dn);
        assert.deepEqual(dn.dict.keys, ["b"], "keys contains b only (2)");

        dn.dict.remove("b");
        assert.deepEqual(dn.dict.keys, [], "keys is empty again");
        dn = await mutationComplete(dn);
        assert.deepEqual(dn.dict.keys, [], "keys is empty again (2)");
    });

    it("should support toObject()", async function () {
        let dn = new DictTestNode();

        assert.deepEqual(dn.dict.toObject(), {}, "empty object by default");
        assert.equal(isMutating(dn), false, "not mutating after toObject() call");

        let nda = dn.dict.newItem("a"), ndb = dn.dict.newItem("b");
        assert.deepEqual(dn.dict.toObject(), { a: nda, b: ndb }, "a and b in object");

        dn = await mutationComplete(dn);
        assert.deepEqual(dn.dict.toObject(), { a: nda, b: ndb }, "a and b in object (2)");

        dn.dict.remove("a");
        assert.deepEqual(dn.dict.toObject(), { b: ndb }, "b in object");
        dn.dict.remove("b");
        assert.deepEqual(dn.dict.toObject(), {}, "empty object");

        dn = await mutationComplete(dn);
        assert.deepEqual(dn.dict.toObject(), {}, "empty object (2)");
    });

    it("should support toString()", function () {
        let dn = new DictTestNode();

        assert.equal(dn.dict.toString(), "[Hibe Dictionary (0)]", "empty dictionary");

        dn.dict.newItem("a");
        dn.dict.newItem("b");
        assert.equal(dn.dict.toString(), "[Hibe Dictionary (2)]", "dictionary with 2 items");
    });

    it("should be disposed when not used any longer", async function () {
        let d = hDictionary(TestNode)(),
            nda: any = d.newItem("a"),
            ndb: any = d.newItem("b");

        nda.value = "a";
        ndb.value = "b";
        d = await mutationComplete(d);

        assert.deepEqual(d.get("a")!["$dmd"].parents, [d], "nda has d as parent");

        let o = d.dispose();
        assert.equal(o["a"].value, "a", "a is a");
        assert.equal(o["b"].value, "b", "b is b");
        assert.deepEqual(o["a"]["$dmd"].parents, [], "o['a'] has no more parents");
    });

});
