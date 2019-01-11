import * as assert from 'assert';
import { TestNode, DictTestNode, TestMap } from "./testnodes";
import { isMutating, mutationComplete, map, latestVersion, load } from '../hibe';

describe('Maps', () => {

    it("should be supported for Datasets", async function () {
        let d = map(TestNode);

        assert.equal(d.size, 0, "size is 0");
        assert.equal(isMutating(d), false, "d is not mutating");

        let nd1 = new TestNode();
        d.set("nd", nd1);

        assert.equal(d.size, 1, "size is 1");
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
        let d = map(String);

        assert.equal(d.get("a"), null, "get null on undefined item");

        let m = d.set("a", "value a");
        assert.equal(m, d, "set returns the map");
        assert.equal(d.size, 1, "size is 1");
        assert.equal(isMutating(d), true, "mutation started");

        d.set("b", "value b");
        assert.equal(d.size, 2, "size is now 2");

        let d2 = await mutationComplete(d);
        assert.equal(d["$next"], d2, "d2 is next d version");
        assert.equal(d2.get("a"), "value a", "a:value a");

        d2.set("a", "value a2");
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
        //node10.dict = hDictionary(TestNode)();
        node10.dict.set("A", itemA);
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

        node12.dict.set("A", null);
        let node13 = await mutationComplete(node12);
        assert.equal(node12.dict.get("A")!.value, "vA2", "dict.get('A').value is back to vA2");
        assert.equal(node13.dict.get("A"), null, "node13 dict.get('A') is now null");
        assert.equal(node13.dict.size, 1, "node13 dict.size is still 1");

        node13.dict.set("A", null);
        assert.equal(isMutating(node13), false, "node13 unchanged");
        let node14 = await mutationComplete(node13);
        assert.equal(node14, node13, "no change on node14");
    });

    it("should support delete()", async function () {
        let dn = new DictTestNode();

        let nda = new TestNode();
        dn.dict.set("a", nda);
        nda.value = "VA";
        let ndb = new TestNode();
        dn.dict.set("b", ndb);
        ndb.value = "VB";
        assert.equal(dn.dict.size, 2, "2 items");

        dn = await mutationComplete(dn);

        let nda2 = latestVersion(nda);
        assert.equal(dn.dict.size, 2, "2 items (2)");
        assert.equal(nda2, dn.dict.get("a"), "nda correctly updated");

        assert.deepEqual(nda2["$dmd"].parents, [dn.dict], "dn.dict is nda2 parent");

        dn.dict.delete("a");

        assert.equal(dn.dict.size, 1, "size is now 1");
        assert.equal(isMutating(dn), true, "dn is mutating");
        assert.equal(dn.dict.get("a"), null, "dict.get('a') returns null");

        dn = await mutationComplete(dn);
        assert.deepEqual(nda2["$dmd"].parents, [], "nda2 has no parents any more");
        assert.strictEqual(dn.dict["$$map"].has("a"), false, "nda2 has been removed from the $$dict map");

        dn.dict.set("a", nda2);

        dn = await mutationComplete(dn);
        assert.equal(dn.dict.size, 2, "size is now 2");
        assert.equal(isMutating(dn), false, "dn is not mutating");
        assert.equal(dn.dict.get("a"), nda2, "dict.get('a') returns nda2");
        assert.deepEqual(nda2["$dmd"].parents, [dn.dict], "nda2 has one parent again");
        assert.strictEqual(dn.dict["$$map"].get("a"), nda2, "nda2 is in $$dict map");
    });

    function getKeys(dn) {
        let it = dn.dict.keys(), arr: any[] = [];
        let itm = it.next();
        while (!itm.done) {
            arr.push(itm.value);
            itm = it.next();
        }
        return arr;
    }

    it("should support keys retrieval", async function () {
        let dn = new DictTestNode();

        assert.deepEqual(getKeys(dn), [], "keys is empty");
        assert.equal(isMutating(dn.dict), false, "not mutating after keys retrieval");

        let nda = dn.dict["$newItem"]("a");
        dn.dict.set("a", nda);
        assert.deepEqual(getKeys(dn), ["a"], "keys contains a");

        dn = await mutationComplete(dn);
        assert.deepEqual(getKeys(dn), ["a"], "keys contains a (2)");

        dn.dict.set("b", new TestNode());
        assert.deepEqual(getKeys(dn), ["a", "b"], "keys contains a and b");

        dn = await mutationComplete(dn);
        assert.deepEqual(getKeys(dn), ["a", "b"], "keys contains a and b (2)");

        dn.dict.set("a", nda);
        assert.deepEqual(getKeys(dn), ["a", "b"], "keys contains a and b (3)");
        assert.equal(isMutating(dn), false, "setting the same item in the list didn't trigger a change");

        dn.dict.delete("a");
        assert.deepEqual(getKeys(dn), ["b"], "keys contains b only");

        dn = await mutationComplete(dn);
        assert.deepEqual(getKeys(dn), ["b"], "keys contains b only (2)");

        dn.dict.delete("b");
        assert.deepEqual(getKeys(dn), [], "keys is empty again");
        dn = await mutationComplete(dn);
        assert.deepEqual(getKeys(dn), [], "keys is empty again (2)");
    });

    it("should support toString()", function () {
        let dn = new DictTestNode();

        assert.equal(dn.dict.toString(), "Hibe Map [size:0]", "Hibe map - empty");

        dn.dict.set("a", new TestNode());
        dn.dict.set("b", new TestNode());
        assert.equal(dn.dict.toString(), "Hibe Map [size:2]", "Hibe map - 2 keys");
    });

    function initDictTest() {
        let dn = new DictTestNode();
        dn.dict.set("a", new TestNode());
        dn.dict.get("a")!.value = "vA";
        dn.dict.set("b", new TestNode());
        dn.dict.get("b")!.value = "vB";
        return dn;
    }

    it("should support has()", async function () {
        let dn = initDictTest();

        assert.equal(dn.dict.has("a"), true, "a key exists");
        assert.equal(dn.dict.has("c"), false, "c key doesn't exists");

        dn = await mutationComplete(dn);
        assert.deepEqual(getKeys(dn), ["a", "b"], "dn contains a and b");
        assert.equal(isMutating(dn), false, "dn is not mutating");
        assert.equal(dn.dict.has("a"), true, "a key exists (2)");
        assert.equal(dn.dict.has("c"), false, "c key doesn't exists (2)");

        dn.dict.delete("a");
        assert.equal(dn.dict.has("a"), false, "a key doesn't exists (3)");

        dn = await mutationComplete(dn);
        assert.equal(dn.dict.has("a"), false, "a key doesn't exists (4)");
    });

    it("should support clear()", async function () {
        let dn = initDictTest();

        dn = await mutationComplete(dn);
        assert.deepEqual(getKeys(dn), ["a", "b"], "dn contains a and b");
        assert.equal(isMutating(dn), false, "dn is not mutating");

        dn.dict.clear();
        assert.equal(isMutating(dn), true, "dn is mutating");
        assert.deepEqual(getKeys(dn), [], "dn dict is empty");

        dn = await mutationComplete(dn);
        assert.deepEqual(getKeys(dn), [], "dn dict is empty (2)");
    });

    it("should support entries()", async function () {
        let dn = initDictTest();

        function getEntries(dn) {
            let it = dn.dict.entries(), arr: any[] = [];
            let itm = it.next();
            while (!itm.done) {
                arr.push("0:" + itm.value[0] + "/1:" + itm.value[1].value);
                itm = it.next();
            }
            return arr;
        }

        assert.deepEqual(getEntries(dn), ["0:a/1:vA", "0:b/1:vB"], "valid entries (1)");

        dn = await mutationComplete(dn);
        assert.deepEqual(getEntries(dn), ["0:a/1:vA", "0:b/1:vB"], "valid entries (2)");

        dn.dict.delete("a");
        dn = await mutationComplete(dn);
        assert.deepEqual(getEntries(dn), ["0:b/1:vB"], "valid entries (3)");
    });

    it("should support forEach()", async function () {
        let dn = initDictTest();

        function getForEach(dn: DictTestNode) {
            let arr: any[] = [];
            dn.dict.forEach((item, key) => {
                arr.push(key + ":" + item!.value)
            })
            return arr;
        }

        assert.deepEqual(getForEach(dn), ["a:vA", "b:vB"], "valid forEach (1)");

        dn = await mutationComplete(dn);
        assert.deepEqual(getForEach(dn), ["a:vA", "b:vB"], "valid forEach (2)");

        dn.dict.delete("a");
        dn = await mutationComplete(dn);
        assert.deepEqual(getForEach(dn), ["b:vB"], "valid forEach (3)");
    });

    it("should support values()", async function () {
        let dn = initDictTest();

        function getValues(dn: DictTestNode) {
            let it = dn.dict.values(), arr: any[] = [];
            let itm = it.next();
            while (!itm.done) {
                arr.push(itm.value!.value);
                itm = it.next();
            }
            return arr;
        }

        assert.deepEqual(getValues(dn), ["vA", "vB"], "valid values (1)");

        dn = await mutationComplete(dn);
        assert.deepEqual(getValues(dn), ["vA", "vB"], "valid values (2)");

        dn.dict.delete("a");
        dn = await mutationComplete(dn);
        assert.deepEqual(getValues(dn), ["vB"], "valid values (3)");
    });

    it("should be disposed when not used any longer", async function () {
        let d = map(TestNode),
            nda = new TestNode(),
            ndb = new TestNode();
        d.set("a", nda);
        d.set("b", ndb);

        nda.value = "a";
        ndb.value = "b";
        d = await mutationComplete(d);

        assert.deepEqual(d.get("a")!["$dmd"].parents, [d], "nda has d as parent");

        let o = d.$dispose();
        assert.equal(o.get("a")!.value, "a", "a is a");
        assert.equal(o.get("b")!.value, "b", "b is b");
        assert.deepEqual(o.get("a")!["$dmd"].parents, [], "o['a'] has no more parents");
    });

    it('should accept a Map to be set as an HMap', async function () {
        let node10 = new TestMap();
        assert.deepEqual(node10.dict, undefined, "dict is undefined");

        let m = new Map();
        m.set("a", load({ value: "a" }, TestNode));
        m.set("b", load({ value: "b" }, TestNode));

        node10.dict = m;

        assert.equal(isMutating(node10), true, "node10 is mutating");
        assert.equal(node10.dict.get("a")!.value, "a", "value a is 'a'");

        let node11 = await mutationComplete(node10);
        assert.equal(node10.dict, undefined, "node10 back to initial state");
        assert.equal(node11.dict.get("a")!.value, "a", "value a is 'a'");

        m.get("b")!.value = "new b";
        let node12 = await mutationComplete(node11);
        assert.equal(node11["$next"], node12 , "node11 is node10.$next");
        assert.equal(node12.dict.get("a")!.value, "a", "value a is 'a' in node12");
    });

});
