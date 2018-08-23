import * as assert from 'assert';
import { TestNode, ArrTestNode } from "./testnodes";
import * as tn from "./testnodes";
import { isMutating, mutationComplete, latestVersion, hList } from '../hibe';

describe('Computed props', () => {

    it('should work for simple types', async function () {
        let initCount = tn.processLengthCounter,
            atn = new ArrTestNode();

        assert.equal(tn.processLengthCounter, initCount, "processor not called by constructor");
        assert.equal(atn.listLength, 0, "listLength is 0 by default 1");
        assert.equal(tn.processLengthCounter, initCount + 1, "processor called once");
        assert.equal(atn.listLength, 0, "listLength is 0 by default 2");
        assert.equal(tn.processLengthCounter, initCount + 1, "processor still called once");

        let ls = atn.list = hList(TestNode)();
        // list prop changed
        assert.equal(atn.listLength, 0, "listLength is 0 by default 3");
        assert.equal(tn.processLengthCounter, initCount + 2, "processor called twice");
        assert.equal(atn.listLength, 0, "listLength is 0 by default 4");
        assert.equal(tn.processLengthCounter, initCount + 2, "processor called twice 2");

        assert.equal(isMutating(ls), false, "ls is not mutating");
        ls.push(new TestNode());
        assert.equal(isMutating(ls), true, "ls is mutating");
        assert.equal(atn.listLength, 1, "listLength is 1 (1)");
        assert.equal(tn.processLengthCounter, initCount + 3, "processor called 3 times");
        assert.equal(atn.listLength, 1, "listLength is 1 (2)");
        assert.equal(tn.processLengthCounter, initCount + 4, "processor called 4 times as list is mutating");

        atn = <ArrTestNode>await mutationComplete(atn);
        assert.equal(atn.listLength, 1, "listLength is 1 (3)");
        assert.equal(tn.processLengthCounter, initCount + 5, "processor called 5 times as list has mutated");
        atn.name = "some new name";
        assert.equal(atn.listLength, 1, "listLength is 1 (4)");
        assert.equal(tn.processLengthCounter, initCount + 5, "processor called 5 times as list has not changed");

        atn.list.get(0)!.value = "v2";
        assert.equal(atn.listLength, 1, "listLength is 1 (5)");
        assert.equal(tn.processLengthCounter, initCount + 6, "processor called 6 times as list is mutating");

        atn = <ArrTestNode>await mutationComplete(atn);
        assert.equal(atn.listLength, 1, "listLength is 1 (6)");
        assert.equal(tn.processLengthCounter, initCount + 7, "processor called 7 times as list has changed");
        assert.equal(atn.listLength, 1, "listLength is 1 (7)");
        assert.equal(tn.processLengthCounter, initCount + 7, "processor called 7 times as list has not changed");

        latestVersion(ls).push(new TestNode());
        atn = <ArrTestNode>await mutationComplete(atn);
        assert.equal(atn.listLength, 2, "listLength is 2");
        assert.equal(tn.processLengthCounter, initCount + 8, "processor called 8 times as list has changed");
    });

});
