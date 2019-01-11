import * as assert from 'assert';
import { TestNode, ArrTestNode, initNewArrTestNode, TestList } from "../test/testnodes";
import { isMutating, mutationComplete, latestVersion, list } from '../hibe';

describe('Lists', () => {

    it('should support the creation of List of Datasets', async function () {
        let ls = list(TestNode);

        assert.equal(ls["$kind"], "DATASET", "list is a data node");
        assert.equal(ls[0], null, "get null on undefined item");
        assert.equal(ls.length, 0, "empty list after creation");
        assert.equal(isMutating(ls), false, "list is not mutating after creation");

        let nd1 = new TestNode();
        ls[1] = nd1;

        assert.equal(ls.length, 2, "length is 2");
        assert.equal(isMutating(ls), true, "list is mutating after first set");
        assert.equal(ls[1], nd1, "nd1 at position 1");

        let list2 = await mutationComplete(ls);
        assert.equal(ls["$next"], list2, "list2 is next list version");
        assert.equal(isMutating(list2), false, "list2 is not mutating after creation");
        assert.equal(list2[1], nd1, "nd1 at position 1 in list2");
        assert.equal(nd1["$next"], undefined, "nd1 hasn't changed");

        nd1.value = "v2";

        assert.equal(isMutating(list2), true, "list2 is mutating after item update");
        assert.equal(list2[1]!.value, "v2", "get(1).value returns new value");

        let list3 = await mutationComplete(list2);

        assert.equal(list2["$next"], list3, "list3 is next list version");
        assert.equal(isMutating(list3), false, "list3 is not mutating after creation");
        assert.equal(list3[1], (<any>nd1).$next, "list3.get(1) is nd1.$next");
    });

    it('should support the creation of Lists of Numbers', async function () {
        let ls = list(Number);

        assert.equal(ls[0], null, "get null on undefined item");
        assert.equal(ls.length, 0, "empty list after creation");
        assert.equal(isMutating(ls), false, "list is not mutating after creation");

        ls[1] = 18;

        assert.equal(ls.length, 2, "length is 2");
        assert.equal(isMutating(ls), true, "list is mutating after first set");
        assert.equal(ls[1], 18, "18 at position 1");

        let list2 = await mutationComplete(ls);

        assert.equal(ls["$next"], list2, "list2 is next list version");
        assert.equal(isMutating(list2), false, "list2 is not mutating after creation");
        assert.equal(list2[1], 18, "18 at position 1 in list2");

        list2[1] = 19;

        assert.equal(isMutating(list2), true, "list2 is mutating after item update");
        assert.equal(list2[1], 19, "get(1).value returns 19");

        let list3 = await mutationComplete(list2);

        assert.equal(list2["$next"], list3, "list3 is next list version");
        assert.equal(isMutating(list3), false, "list3 is not mutating after creation");
        assert.equal(list3[1], 19, "list3.get(1) is 19");
    });

    it('should accept an array to be set as a list', async function () {
        let node10 = new TestList();
        assert.deepEqual(node10.list, undefined, "list is undefined");

        let arr = [
            new TestNode(),
            new TestNode()
        ]
        arr[0].value = "a";
        arr[1].value = "b";

        node10.list = arr;

        assert.equal(isMutating(node10), true, "node10 is mutating");
        assert.equal(node10.list[0].value, "a", "value 0 is 'a'");

        let node11 = await mutationComplete(node10);
        assert.equal(node10.list, undefined, "node10 back to initial state");
        assert.equal(node11.list[0].value, "a", "value is still 'a'");
    });

    it('should properly update data lists: nothing -> sthV2 -> sthV3 -> null -> null', async function () {
        let node10 = new ArrTestNode();

        assert.equal(isMutating(node10), false, "node10 unchanged");
        let itemA = new TestNode();
        node10.list[0] = itemA;
        itemA.value = "A";

        assert.equal(isMutating(node10), true, "node10 changed");
        let node11 = await mutationComplete(node10);
        assert.equal(isMutating(node11), false, "node11 unchanged");
        assert.equal(node11.list[0]!.value, "A", "list.get(0).value is A");
        assert.equal(node10.list.length, 0, "node10.list back to empty list");
        assert.equal(node11.list.length, 1, "node11.list has only one item");

        node11.list[0]!.value = "A2";
        let node12 = await mutationComplete(node11);
        assert.equal(node11.list[0]!.value, "A", "list.get(0).value is back to A");
        assert.equal(node12.list[0]!.value, "A2", "list.get(0).value is now A2");

        node12.list[0] = null;
        let node13 = await mutationComplete(node12);
        assert.equal(node12.list[0]!.value, "A2", "list.get(0).value is back to A2");
        assert.equal(node13.list[0], null, "node13 list[0] is now null");
        assert.equal(node13.list.length, 1, "node13 list.length is still 1");

        node13.list[0] = null;
        assert.equal(isMutating(node13), false, "node13 unchanged");
        let node14 = await mutationComplete(node13);
        assert.equal(node14, node13, "no change on node14");
    });

    it('should support adding items', async function () {
        let atn = new ArrTestNode();

        assert.equal(atn.list.length, 0, "empty list");
        let item = new TestNode();
        atn.list[0] = item;
        item.value = "item 0";

        assert.equal(atn.list.length, 1, "1 item list");
        assert.equal(atn.list[0]!.value, "item 0", "first item is item 0");

        atn = await mutationComplete(atn);
        assert.equal(atn.list.length, 1, "1 item list (2)");
        assert.equal(atn.list[0]!.value, "item 0", "first item is item 0 (2)");

        item = new TestNode();
        atn.list[2] = item;
        item.value = "item 2";
        assert.equal(atn.list.length, 3, "3 items in list");
        assert.equal(atn.list[2]!.value, "item 2", "3rd item is item 2");
    });

    it('should support List.push', async function () {
        let node10 = new ArrTestNode(), item: TestNode;

        let node11 = await mutationComplete(node10);
        item = new TestNode();
        item.value = "a";
        assert.equal(node11.list.length, 0, "empty list");
        assert.equal(isMutating(node11), false, "node11 not mutating");
        node11.list.push(item);
        assert.equal(isMutating(node11), true, "node11 now mutating");
        assert.equal(node11.list.length, 1, "one item in list");
        assert.equal(isMutating(node11), true, "node11 is mutating");

        let node12 = await mutationComplete(node11);
        item = new TestNode();
        item.value = "b";
        assert.equal(node12.list.length, 1, "one item in list");
        assert.equal(node12.list[0]!.value, "a", "value0 is a");
        node12.list.push(item);
        assert.equal(node12.list.length, 2, "two items in list");
        assert.equal(isMutating(node12), true, "node12 is mutating");

        let node13 = await mutationComplete(node12);
        assert.equal(node12.list.length, 1, "node12 back to original length");
        assert.equal(node13.list.length, 2, "two items in list (2)");
        assert.equal(node13.list[1]!.value, "b", "value1 is b");
    });

    it('should support List.splice', async function () {
        function stringifyList(list) {
            let arr: string[] = [];
            for (let i = 0; list.length > i; i++) {
                itm = list[i];
                arr.push(itm ? itm.value : "null");
            }
            return arr.join("-");
        }

        let node10 = new ArrTestNode(),
            list = node10.list,
            itm: TestNode;
        itm = list[0] = new TestNode();
        itm.value = "i1";
        itm = list[1] = new TestNode();
        itm.value = "i2";
        itm = list[3] = new TestNode();
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
            if (value) {
                arr.push(value.value + "/" + index);
                assert.equal(dList, node11.list["$$list"], "list is dList");
            }
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

    // TODO: support array set and create a new proxy automatically

    it('should support toString', async function () {
        let ls = list(Number);

        assert.equal(ls.toString(), "Hibe List []" , "empty list");

        ls[0]=123;
        ls[1]=234;
        assert.equal(ls.toString(), "Hibe List [123, 234]" , "empty list");
    });

    it('should support List.indexOf', async function () {
        let node10 = initNewArrTestNode();
        let node11 = await mutationComplete(node10), arr: string[] = [];

        let itm1 = node11.list[1];
        assert.equal(node11.list.indexOf(itm1), 1, "itm1 index is 1");
    });

    it('should support list of lists', async function () {
        let l = list(list(TestNode)),
             l0 = l.$newItem(),
             l00 = l0.$newItem();

        assert.equal(l[0][0].value, "v1" , "default value 1");
        assert.equal(isMutating(l), true, "l is mutating");
        l00.value = "item 00";
        assert.equal(l[0][0].value, "item 00", "first item can be retrieved");

        l = await mutationComplete(l);
        assert.equal(isMutating(l), false, "l is mutating");
        assert.equal(l[0][0].value, "item 00", "first item can be retrieved (2)");
    });

    it("should be disposed when not used any longer", async function () {
        let ls = list(TestNode),
            nda = ls[0] = new TestNode(),
            ndb = ls[1] = new TestNode();

        nda.value = "a";
        ndb.value = "b";
        ls = await mutationComplete(ls);

        assert.deepEqual(ls[0]!["$dmd"].parents, [ls], "nda has list as parent");

        let arr = ls.$dispose();
        assert.equal(arr.length, 2, "2 items returned");
        assert.equal(arr[0].value, "a", "arr[0] is item a");
        assert.deepEqual(arr[0]["$dmd"].parents, [], "item a has no more parents");
    });

});
