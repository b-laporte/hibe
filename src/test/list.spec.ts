import * as assert from 'assert';
import { TestNode, ArrTestNode, initNewArrTestNode } from "./testnodes";
import { isMutating, mutationComplete, latestVersion, hList } from '../hibe';

describe('Lists', () => {

    it('should support the creation of List of Datasets', async function () {
        let list = hList(TestNode)();

        assert.equal(list.get(0), null, "get null on undefined item");
        assert.equal(list.length, 0, "empty list after creation");
        assert.equal(isMutating(list), false, "list is not mutating after creation");

        let nd1 = new TestNode();
        list.set(1, nd1);

        assert.equal(list.length, 2, "length is 2");
        assert.equal(isMutating(list), true, "list is mutating after first set");
        assert.equal(list.get(1), nd1, "nd1 at position 1");

        let list2 = await mutationComplete(list);
        assert.equal(list["$next"], list2, "list2 is next list version");
        assert.equal(isMutating(list2), false, "list2 is not mutating after creation");
        assert.equal(list2.get(1), nd1, "nd1 at position 1 in list2");
        assert.equal(nd1["$next"], undefined, "nd1 hasn't changed");

        nd1.value = "v2";

        assert.equal(isMutating(list2), true, "list2 is mutating after item update");
        assert.equal(list2.get(1)!.value, "v2", "get(1).value returns new value");

        let list3 = await mutationComplete(list2);

        assert.equal(list2["$next"], list3, "list3 is next list version");
        assert.equal(isMutating(list3), false, "list3 is not mutating after creation");
        assert.equal(list3.get(1), (<any>nd1).$next, "list3.get(1) is nd1.$next");
    });

    it('should support the creation of Lists of Numbers', async function () {
        let list = hList(Number)();

        assert.equal(list.get(0), null, "get null on undefined item");
        assert.equal(list.length, 0, "empty list after creation");
        assert.equal(isMutating(list), false, "list is not mutating after creation");

        list.set(1, 18);

        assert.equal(list.length, 2, "length is 2");
        assert.equal(isMutating(list), true, "list is mutating after first set");
        assert.equal(list.get(1), 18, "18 at position 1");

        let list2 = await mutationComplete(list);

        assert.equal(list["$next"], list2, "list2 is next list version");
        assert.equal(isMutating(list2), false, "list2 is not mutating after creation");
        assert.equal(list2.get(1), 18, "18 at position 1 in list2");

        list2.set(1, 19);

        assert.equal(isMutating(list2), true, "list2 is mutating after item update");
        assert.equal(list2.get(1), 19, "get(1).value returns 19");

        let list3 = await mutationComplete(list2);

        assert.equal(list2["$next"], list3, "list3 is next list version");
        assert.equal(isMutating(list3), false, "list3 is not mutating after creation");
        assert.equal(list3.get(1), 19, "list3.get(1) is 19");
    });

    it('should properly update data lists: nothing -> sthV2 -> sthV3 -> null -> null', async function () {
        let node10 = new ArrTestNode();

        assert.equal(isMutating(node10), false, "node10 unchanged");
        let itemA = new TestNode();
        node10.list = hList(TestNode)();
        node10.list.set(0, itemA);
        itemA.value = "A";

        assert.equal(isMutating(node10), true, "node10 changed");
        let node11 = await mutationComplete(node10);
        assert.equal(isMutating(node11), false, "node11 unchanged");
        assert.equal(node11.list.get(0)!.value, "A", "list.get(0).value is A");
        assert.equal(node10.list.length, 0, "node10.list back to empty list");
        assert.equal(node11.list.length, 1, "node11.list has only one item");

        node11.list.get(0)!.value = "A2";
        let node12 = await mutationComplete(node11);
        assert.equal(node11.list.get(0)!.value, "A", "list.get(0).value is back to A");
        assert.equal(node12.list.get(0)!.value, "A2", "list.get(0).value is now A2");

        node12.list.set(0, null);
        let node13 = await mutationComplete(node12);
        assert.equal(node12.list.get(0)!.value, "A2", "list.get(0).value is back to A2");
        assert.equal(node13.list.get(0), null, "node13 list[0] is now null");
        assert.equal(node13.list.length, 1, "node13 list.length is still 1");

        node13.list.set(0, null);
        assert.equal(isMutating(node13), false, "node13 unchanged");
        let node14 = await mutationComplete(node13);
        assert.equal(node14, node13, "no change on node14");
    });

    it('should support List.newItem', async function () {
        let atn = new ArrTestNode();

        assert.equal(atn.list.length, 0, "empty list");
        let item = atn.list.newItem();
        item.value = "item 0";

        assert.equal(atn.list.length, 1, "1 item list");
        assert.equal(atn.list.get(0)!.value, "item 0", "first item is item 0");

        atn = await mutationComplete(atn);
        assert.equal(atn.list.length, 1, "1 item list (2)");
        assert.equal(atn.list.get(0)!.value, "item 0", "first item is item 0 (2)");

        item = atn.list.newItem(2);
        item.value = "item 2";
        assert.equal(atn.list.length, 3, "3 items in list");
        assert.equal(atn.list.get(2)!.value, "item 2", "3rd item is item 2");
    });

    it('should support List.push', async function () {
        let node10 = new ArrTestNode(), item: TestNode;
        node10.list = hList(TestNode)();

        let node11 = await mutationComplete(node10);
        item = new TestNode();
        item.value = "a";
        assert.equal(node11.list.length, 0, "empty list");
        node11.list.push(item);
        assert.equal(node11.list.length, 1, "one item in list");
        assert.equal(isMutating(node11), true, "node11 is mutating");

        let node12 = await mutationComplete(node11);
        item = new TestNode();
        item.value = "b";
        assert.equal(node12.list.length, 1, "one item in list");
        assert.equal(node12.list.get(0)!.value, "a", "value0 is a");
        node12.list.push(item);
        assert.equal(node12.list.length, 2, "two items in list");
        assert.equal(isMutating(node12), true, "node12 is mutating");

        let node13 = await mutationComplete(node12);
        assert.equal(node12.list.length, 1, "node12 back to original length");
        assert.equal(node13.list.length, 2, "two items in list (2)");
        assert.equal(node13.list.get(1)!.value, "b", "value1 is b");
    });

    it('should support List.splice', async function () {
        function stringifyList(list) {
            let arr: string[] = [];
            for (let i = 0; list.length > i; i++) {
                itm = list.get(i)!;
                arr.push(itm ? itm.value : "null");
            }
            return arr.join("-");
        }

        let node10 = new ArrTestNode(),
            list = node10.list = hList(TestNode)(),
            itm = list.set(0, new TestNode())!;
        itm.value = "i1";
        itm = list.set(1, new TestNode())!;
        itm.value = "i2";
        itm = list.set(3, new TestNode())!;
        itm.value = "i4";

        let node11 = await mutationComplete(node10);
        assert.equal(stringifyList(node11.list), "i1-i2-null-i4", "list original content");
        assert.equal(isMutating(node11), false, "no change on node11");

        node11.list.splice(1, 2);
        assert.equal(isMutating(node11), true, "splice changed node11");

        let node12 = await mutationComplete(node11);
        assert.equal(stringifyList(node11.list), "i1-i2-null-i4", "node11.list original content");
        assert.equal(stringifyList(node12.list), "i1-i4", "node12.list new content");
        assert.equal(latestVersion(node11.list), node12.list, "latestVersion of node11.list is node12.list");

        node12.list.splice(1, 0, new TestNode()); // insert a new item
        let node13 = await mutationComplete(node12);
        assert.equal(stringifyList(node13.list), "i1-v1-i4", "node13.list content");
    });

    it('should support List.forEach', async function () {
        let node10 = initNewArrTestNode();
        let node11 = await mutationComplete(node10), arr: string[] = [];
        node11.list.forEach((value, index, dList) => {
            arr.push(value.value + "/" + index);
            assert.equal(dList, node11.list, "list is dList");
        });
        assert.equal(arr.join("-"), "i1/0-i2/1-i3/2", "forEach result");
        assert.equal(isMutating(node11), false, "node11 is unchanged");

        let o = {
            count: 0,
            increment() {
                this.count++;
            }
        }

        node11.list.forEach(o.increment, o);
        assert.equal(o.count, 3, "forEach result with thisArg");
        assert.equal(isMutating(node11), false, "node11 is unchanged");
    });

    TestNode.prototype.toString = function () {
        return "TestNode " + this.value;
    }

    it('should support List.filter', async function () {
        let node10 = initNewArrTestNode();
        let node11 = await mutationComplete(node10), arr: string[] = [];

        let ls = node11.list.filter((item: TestNode, index) => {
            return (item.value === "i1") || (index === 2);
        });

        assert.equal(ls.constructor, Array, "ls is an Array");
        assert.equal(ls.length, 2, "2 items in the list");
        assert.equal(isMutating(node11), false, "node11 is unchanged");
        assert.equal(ls.join(','), "TestNode i1,TestNode i3", "ls content");
        assert.equal((ls[0] as any).$dmd.parents.length, 1, "list items still have 1 parent");
    });

    it('should support List.filterItems', async function () {
        let atn = initNewArrTestNode(), arr: string[] = [];
        atn = await mutationComplete(atn);

        let itm0 = atn.list.get(0)!;
        assert.equal(itm0["$dmd"].parents.length, 1, "itm0 has one parent");
        assert.equal(itm0["$dmd"].parents[0], atn.list, "atn.list is itm0 unique parent");
        assert.equal(isMutating(atn), false, "atn is not mutating");
        assert.equal(atn.list.length, 3, "3 items in list");

        atn.list.filterItems((item: TestNode, index) => {
            return true;
        });

        assert.equal(isMutating(atn), false, "atn is still not mutating");

        // remove first item
        atn.list.filterItems((item: TestNode, index) => {
            return index !== 0;
        });

        assert.equal(isMutating(atn), true, "atn is mutating");
        assert.equal(atn.list.length, 2, "2 items in list");
        assert.equal(itm0["$dmd"].parents.length, 0, "itm0 has no more parents");

        atn = await mutationComplete(atn);
        assert.equal(isMutating(atn), false, "atn is not mutating anymore");
        assert.equal(atn.list.length, 2, "2 items in list");
        assert.equal(itm0["$dmd"].parents.length, 0, "itm0 has no more parents");

        itm0 = atn.list.get(0)!;
        assert.equal(itm0["$dmd"].parents.length, 1, "itm0 has one parent (2)");
        assert.equal(itm0["$dmd"].parents[0], atn.list, "atn.list is itm0 unique parent (2)");
    });

    it('should support List.toArray', async function () {
        let atn = initNewArrTestNode(), arr: TestNode[];
        atn = await mutationComplete(atn);

        arr = atn.list.toArray();
        assert.equal(arr.join(","), "TestNode i1,TestNode i2,TestNode i3", "arr content: TestNode i1,TestNode i2,TestNode i3");
        assert.equal(isMutating(atn), false, "atn is not mutating");
        arr.splice(0, 1);
        assert.equal(arr.join(","), "TestNode i2,TestNode i3", "arr content: TestNode i2,TestNode i3");
        assert.equal(isMutating(atn), false, "atn is not mutating");
        assert.equal(atn.list.length, 3, "3 items in atn list");
    });

    it('should support List.indexOf', async function () {
        let node10 = initNewArrTestNode();
        let node11 = await mutationComplete(node10), arr: string[] = [];

        let itm1 = node11.list!.get(1);
        assert.equal(node11.list!.indexOf(itm1), 1, "itm1 index is 1");
    });

    it('should support list of lists', async function () {
        let l = hList(hList(TestNode))(),
            l0 = l.newItem(),
            l00 = l0.newItem();

        assert.equal(isMutating(l), true, "l is mutating");
        l00.value = "item 00";
        assert.equal(l.get(0)!.get(0)!.value, "item 00", "first item can be retrieved");

        l = await mutationComplete(l);
        assert.equal(isMutating(l), false, "l is mutating");
        assert.equal(l.get(0)!.get(0)!.value, "item 00", "first item can be retrieved (2)");
    });

    it("should be disposed when not used any longer", async function () {
        let list = hList(TestNode)(),
            nda: any = list.newItem(),
            ndb: any = list.newItem();

        nda.value = "a";
        ndb.value = "b";
        list = await mutationComplete(list);

        assert.deepEqual(list.get(0)!["$dmd"].parents, [list], "nda has list as parent");

        let arr = list.dispose();
        assert.equal(arr.length, 2, "2 items returned");
        assert.equal(arr[0].value, "a", "arr[0] is item a");
        assert.deepEqual(arr[0]["$dmd"].parents, [], "item a has no more parents");
    });

});
