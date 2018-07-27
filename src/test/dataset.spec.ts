
import * as assert from 'assert';
import { TestNode, SimpleNode, SubTestNode, DsCustom, InitNode } from "./testnodes";
import { isMutating, mutationComplete, isImmutable, lastVersion, create, isDataset, hList, hDictionary } from '../hibe';

describe('Datasets', () => {

    it('should have correct init values', () => {
        let nd = new TestNode();
        assert.equal(nd['$$value'], "v1", "v1 init value string");
        assert.equal(nd['$$node'], undefined, "node is undefined");
        assert.equal(nd['$$node2'], null, "null init node2");
        assert.equal(isMutating(nd), false, "not mutating after creation");
    });

    it('should tell if an object is being changed', async function () {
        let nd = new TestNode();
        assert.equal(isMutating(nd), false, "no mutation on original state");
        nd.value = "v2";
        assert.equal(isMutating(nd), true, "mutation starts after first change");
        let nd2 = await mutationComplete(nd);
        assert.equal(isMutating(nd), false, "no mutation on frozen object");
        assert.equal(isMutating(nd2), false, "no mutation after mutation complete");
        assert.equal(nd.value, "v1", "old version holds old value");
        assert.equal(nd2.value, "v2", "new version holds new value");
        assert.equal((nd as any).$next, nd2, "nd2 is nd.$next");
        nd2.value = "v3";
        let nd3 = await mutationComplete(nd2);
        assert.equal(isMutating(nd2), false, "no mutation on frozen object 2");
        assert.equal(isMutating(nd3), false, "no mutation after mutation complete 2");
        assert.equal(nd2.value, "v2", "old version holds old value");
        assert.equal(nd3.value, "v3", "new version holds new value");
        assert.equal(nd2["$next"], nd3, "nd3 is nd2.$next");
        assert.equal(lastVersion(nd), nd3, "nd3 is last version of nd");
    });

    it('should tell if an object is immutable', async function () {
        let nd = new TestNode();
        assert.equal(isImmutable(nd), false, "object is mutable on original state");
        nd.value = "v2";
        assert.equal(nd.value, "v2", "value read is consistent with last write");
        let nd2 = await mutationComplete(nd);
        assert.equal(isImmutable(nd), true, "old version is immutable");
        assert.equal(isImmutable(nd2), false, "new version is mutable");

        // TODO check errors on immutable object mutation attempt
    });

    it("should tell if an object is a dataset", function () {
        let n = new TestNode();
        assert.equal(isDataset(n), true, "n is a dataset");
        assert.equal(isDataset({}), false, "js object is not a dataset");
        assert.equal(isDataset(true), false, "true is not a dataset");
        assert.equal(isDataset(undefined), false, "undefined is not a dataset");
        let ls = hList(String)();
        assert.equal(isDataset(ls), true, "HList is a dataset");
        let d = hDictionary(String)();
        assert.equal(isDataset(d), true, "HDictionary is a dataset");
    });

    it('should support mutationComplete on unchanged objects', async function () {
        let nd = new TestNode();
        let nd2 = await mutationComplete(nd);
        assert.equal(isMutating(nd), false, "no mutation after mutation complete");
        assert.equal(nd, nd2, "no new version created");
    });

    it('should support child data nodes', async function () {
        let node11 = new TestNode();

        assert.equal(isMutating(node11), false, "initially pristine");

        // check that new parent version is created when child node is set
        let node21 = new TestNode(), nd11 = node11.node;
        node11.node = node21;
        assert.equal(isMutating(node21), false, "sub node pristine after assignment");
        assert.equal(isMutating(node11), true, "not pristine 1");
        assert.equal((node11 as any).$next, null, "no next");

        let node12 = await mutationComplete(node11);
        assert.equal(node11.node, nd11, "node 11 is back to its original state");
        assert.equal(isMutating(node12), false, "pristine 2");
        assert.equal(node12.node, node21, "new node value");
        assert.equal((node12 as any).$next, null, "no next 1");

        // check that new parent version is created when child changes
        node12.node!.value = "abc";
        let node13 = await mutationComplete(node12);
        assert.equal((node13 as any).$next, null, "no next 2");
        assert.equal(node12 !== node13, true, "new root node 13");
        assert.equal(lastVersion(node12), node13, "new root node version");
        assert.equal(node12.node, node21, "node12.node back to original value");
        assert.equal(node12.node !== node13.node, true, "new sub node version");
        assert.equal(lastVersion(node12.node), node13.node, "new sub node version 2");
        assert.equal(node12.node ? node12.node.value : "x", "v1", "sub node reset");
        assert.equal(node13.node ? node13.node.value : "y", "abc", "new value in sub node");

        // check that child is processed before parent even if mutation is done is reverse order
        node13.value = "node13";
        node13.node!.value = "node2x";

        let node14 = await mutationComplete(node13);
        assert.equal(isMutating(node13), false, "node13 is pristine");
        assert.equal(node14.value, "node13", "node14 value");
        assert.equal(lastVersion(node13), node14, "new root node version node14");
        assert.equal(lastVersion(node13.node), node14.node, "new sub node version node14");
        assert.equal(node14.node ? node14.node.value : "x", "node2x", "node14.node value");
    });

    it('should correctly set value back after 2 consecutive changes', async function () {
        // null -> null       : nothing to do
        let node10 = new TestNode();

        assert.equal(isMutating(node10), false, "node10 is pristine");
        assert.equal(node10.value, "v1", "empty value");
        node10.value = "abc";
        node10.value = "def";
        assert.equal(node10.value, "def", "def value");

        let node11 = await mutationComplete(node10);
        assert.equal(isMutating(node10), false, "node11 is pristine");
        assert.equal(node10.value, "v1", "node11 value is back to its original value");
    });

    it('should properly update child refs: null->null', async function () {
        // null -> null       : nothing to do
        let node10 = new TestNode();
        node10.node2 = null;
        assert.equal(isMutating(node10), true, "node10 is mutating");

        let node11 = await mutationComplete(node10);

        assert.equal(isMutating(node11), false, "node11 is pristine");
        node11.node2 = null;
        assert.equal(isMutating(node11), false, "node11 is not mutating");

        let node12 = await mutationComplete(node11);

        assert.equal(node11, node12, "unchanged");
    });

    it('should properly update child refs: null->sth', async function () {
        // null -> sth        : reference latest version of sth, add item to sth parents
        let node10 = new TestNode(), node20 = new TestNode();
        node20.value = "v2";
        node10.node = node20;
        let node11 = await mutationComplete(node10);
        assert.equal(isMutating(node11), false, "node11 is pristine");
        assert.equal(node11.node, lastVersion(node20), "ref latest version of child");
    });

    it('should properly update child refs: null->sth (2)', async function () {
        // null -> sth        : reference latest version of sth, add item to sth parents
        let node10 = new TestNode(), node20 = new TestNode();
        node10.node = node20;
        node20.value = "v2";
        let node11 = await mutationComplete(node10);
        assert.equal(isMutating(node11), false, "node11 is pristine");
        assert.equal(node11.node, lastVersion(node20), "ref latest version of child");
    });

    it('should properly update child refs: sth->sth', async function () {
        // sth -> sth         : no change, still reference the same item
        let node10 = new TestNode(), node20 = new TestNode();
        node20.value = "v2";
        node10.node2 = node20;
        let node11 = await mutationComplete(node10), node21 = node11.node2;

        assert.equal(isMutating(node11), false, "node11 is pristine");
        node11.node2 = node21;
        assert.equal(isMutating(node11), false, "node11 is still pristine");
        node11.node2 = null;
        assert.equal(isMutating(node11), true, "node11 has changed");
        node11.node2 = node21;

        let node12 = await mutationComplete(node11);
        assert.equal(node12, (node11 as any).$next, "node 12 is next node11");
        assert.equal(node12.node2, node21, "node12 sub node hasn't changed");
    });

    it('should properly update child refs: sth->null', async function () {
        // sth -> null        : reference null, clean sth (remove current item from sth parents)
        let node10 = new TestNode(), node20 = new TestNode();
        node20.value = "v2";
        node10.node2 = node20;

        let node11 = await mutationComplete(node10), node21 = lastVersion(node20);
        assert.equal((node21 as any).$dmd!.parents.length, 1, "node21 has one parent");
        assert.equal((node21 as any).$dmd!.parents[0], node11, "node21 parent is node11");
        node11.node2 = null;

        let node12 = await mutationComplete(node11);
        assert.equal(node12, (node11 as any).$next, "node 12 is next node11");
        assert.equal(node12.node2, null, "node12 sub node has been removed");

        assert.equal(lastVersion(node21), node21, "node21 didn't change");
        assert.equal((node21 as any).$dmd!.parents.length, 0, "node21 has no parents any more");
    });

    it('should properly update child refs: sth->null (2)', async function () {
        // sth -> null        : reference null, clean sth (remove current item from sth parents)
        let node10 = new TestNode(), node20 = new TestNode();
        node10.node2 = node20;
        node20.value = "v2";
        let node11 = await mutationComplete(node10), node21 = lastVersion(node20);

        assert.equal((node21 as any).$dmd!.parents.length, 1, "node21 has one parent");
        assert.equal((node21 as any).$dmd!.parents[0], node11, "node21 parent is node11");
        node11.node2 = null;

        let node12 = await mutationComplete(node11);
        assert.equal(node12, (node11 as any).$next, "node 12 is next node11");
        assert.equal(node12.node2, null, "node12 sub node has been removed");

        assert.equal(lastVersion(node21), node21, "node21 didn't change");
        assert.equal((node21 as any).$dmd!.parents.length, 0, "node21 has no parents any more");
    });

    it('should properly update child refs: sth->sthElse unchanged', async function () {
        // sth -> sthElse     : reference sthElse, clean sth, add item to sthElse parents
        let node10 = new TestNode(), node20 = new TestNode(), node30 = new TestNode();
        node10.value = "v1";
        node10.node = node20;
        node20.value = "v2";
        node30.value = "v3";

        let node11 = await mutationComplete(node10), node21 = lastVersion(node20), node31 = lastVersion(node30);
        assert.equal((node21 as any).$dmd!.parents.length, 1, "node21 has one parent");
        assert.equal((node21 as any).$dmd!.parents[0], node11, "node21 parent is node11");
        assert.equal((node31 as any).$dmd!.parents.length, 0, "node31 has no parents");

        node11.node = node30; // will automatically reference the last version of node30

        let node12 = await mutationComplete(node11);

        assert.equal((node21 as any).$dmd!.parents.length, 0, "node21 has no parents anymore");
        assert.equal((node31 as any).$dmd!.parents.length, 1, "node31 has one parent");
        assert.equal((node31 as any).$dmd!.parents[0], node12, "node31 parent is node12");
    });

    it('should properly update child refs: sth->sthElse changed', async function () {
        // sth -> sthElse     : reference sthElse, clean sth, add item to sthElse parents
        let node10 = new TestNode(), node20 = new TestNode(), node30 = new TestNode();
        node10.value = "v1";
        node10.node = node20;
        node20.value = "v2";
        node30.value = "v3";

        let node11 = await mutationComplete(node10), node21 = lastVersion(node20), node31 = lastVersion(node30);
        assert.equal((node21 as any).$dmd!.parents.length, 1, "node21 has one parent");
        assert.equal((node21 as any).$dmd!.parents[0], node11, "node21 parent is node11");
        assert.equal((node31 as any).$dmd!.parents.length, 0, "node31 has no parents");

        node31.value = "v3bis";
        node11.node = node31;

        let node12 = await mutationComplete(node11), node32 = lastVersion(node30);

        assert.equal((node21 as any).$dmd!.parents.length, 0, "node21 has no parents anymore");
        assert.equal((node32 as any).$dmd!.parents.length, 1, "node32 has one parent");
        assert.equal((node32 as any).$dmd!.parents[0], node12, "node32 parent is node12");
    });

    it('should properly update child refs: sth->sthV2', async function () {
        // sth -> sthV2       : reference sthV2, clean sth, add item to sthV2 parents
        let node10 = new TestNode(), node20 = new TestNode();
        node10.node2 = node20;
        node20.value = "v2";

        let node11 = await mutationComplete(node10);
        assert.equal(node10.node2, null, "no node on original node10");
        assert.equal(node11.node2!.value, "v2", "new v2 value");

        node11.node2!.value = "v21";
        let node12 = await mutationComplete(node11);
        assert.equal(node11.node2!.value, "v2", "v2 value on node11");
        assert.equal(node12.node2!.value, "v21", "v21 value on node12");

        // change, set to null and set back
        node12.node2!.value = "v22";
        let n = node12.node2;
        node12.node2 = null;
        node12.node2 = n;

        let node13 = await mutationComplete(node12);
        assert.equal(node12.node2!.value, "v21", "still v21 value on node12");
        assert.equal(node13.node2!.value, "v22", "v22 value on node13");
    });

    it('should properly update 2 refs to the same child', async function () {
        // sth -> sthV2       : reference sthV2, clean sth, add item to sthV2 parents
        let node10 = new TestNode(), node20 = new TestNode();
        node10.node = node20;
        node20.value = "v2";
        node10.node2 = node20;

        assert.equal((node20 as any).$dmd!.parents.length, 2, "parent is referenced twice");
        assert.equal((node10.node as any).$dmd.parents[0], node10, "first parent is node10");
        assert.equal((node10.node as any).$dmd.parents[1], node10, "second parent is node10");

        let node11 = await mutationComplete(node10) as TestNode;
        assert.equal(node10.node!.value, "v1", "node10 reset to original value (new node created)");
        assert.equal(node11.node!.value, "v2", "node value updated");
        assert.equal(node11.node2!.value, "v2", "node2 value updated");
        assert.equal((node11.node as any).$dmd.parents[0], node11, "first parent is node11");
        assert.equal((node11.node as any).$dmd.parents[1], node11, "second parent is node11");

        node11.node2!.value = "v3";
        let node12 = await mutationComplete(node11) as TestNode;
        assert.equal(node11.node!.value, "v2", "node value v2");
        assert.equal(node11.node2!.value, "v2", "node2 value v2");
        assert.equal(node12.node!.value, "v3", "node value v3");
        assert.equal(node12.node2!.value, "v3", "node2 value v3");
        assert.equal((node12.node2! as any).$dmd.parents.length, 2, "node2 parent is referenced twice");

        node12.node!.value = "v4";
        (<any>node12).node = undefined;
        let node13 = await mutationComplete(node12);
        assert.equal((node13.node2! as any).$dmd.parents.length, 1, "node2 parent is now referenced once");
        assert.equal(node13.node2!.value, "v4", "node2 value v4");

        node13.node2 = null;
        let node14 = await mutationComplete(node13), node24 = lastVersion(node20);
        assert.equal((node24 as any).$dmd.parents.length, 0, "node24 parent list is now empty");
        assert.equal(node24.value, "v4", "node24 value is v4");
    });

    it('should automatically create sub-nodes that cannot be undefined', async function () {
        let sn = new SimpleNode();

        assert.notEqual(sn.node, null, "sn.node is not null");
        assert.equal(sn.node!.value, "v1", "sn.node has been properly created");
        assert.equal(sn.list.length, 0, "sn.list is an empty list");

        sn = create(SimpleNode, {});
        assert.equal(sn.node!.value, "v1", "sn.node has been properly created from empty json");
        assert.equal(sn.list.length, 0, "sn.list is has been created as an empty list from empty json");
    });

    it("should support inheritance", async function () {
        let nd = new SubTestNode();

        assert.equal(nd.value, "init value", "nd inherited value");
        assert.equal(nd.quantity, 42, "nd support it own properties");

        nd.node = new TestNode();
        nd.node.value = "v2";
        assert.equal(isMutating(nd), true, "nd is mutating");
        nd.quantity = 123;

        nd = await mutationComplete(nd);
        assert.equal(nd.quantity, 123, "quantity is now 123");
        assert.equal(nd.node!.value, "v2", "nd.node has properly mutated");
    });

    it("should support initialization through init", function () {
        let nd = new DsCustom();

        assert.equal(nd.value, "hello", "right init value");
        assert.equal(nd.quantity, 42, "right init quantity");
        assert.deepEqual(nd.foo, { a: "bar" }, "right init object");
        assert.equal(isMutating(nd), false, "nd is not mutating");
    });

    it("should not call init for object copy", function () {
        let nd = new SubTestNode();
        assert.equal(isMutating(nd), false, "not mutating");
        assert.equal(nd.quantity, 42, "quantity initialized through init");

        let nd2 = nd["$new"](true);
        assert.equal(isMutating(nd2), false, "nd2 not mutating");
        assert.equal(nd2.quantity, 0, "quantity not initialized through init");
    });

    it("should mutate a new object when init sets a changed object", async function () {
        let nd = new InitNode();
        assert.equal(isMutating(nd), true, "init has set a mutating property");
        assert.equal(nd.node.value, "new value", "node value is correctly set");

        nd = await mutationComplete(nd);
        assert.equal(isMutating(nd), false, "nd mutation complete");
        assert.equal(nd.node.value, "new value", "node value is correctly set (2)");
    });

});
