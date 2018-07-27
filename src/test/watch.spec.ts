import * as assert from 'assert';
import { mutationComplete, watch, unwatch } from '../hibe';
import { initNewArrTestNode, TestNode } from './testnodes';

describe('Watchers', () => {

    it('should support watch and unwatch', async function () {
        let node = initNewArrTestNode(), watcherCalls = 0;

        let watchRef = watch(node, (newNode) => {
            watcherCalls++;
            node = newNode;
        });

        await mutationComplete(node);

        assert.equal(watcherCalls, 1, "1 watcher call");
        assert.equal(node.list!.length, 3, "3 items in the node list");
        assert.equal(node.name, "no name", "node name is no name");

        node.name = "ABC";
        let itm = new TestNode();
        itm.value = "last item";
        node.list.push(itm);

        await mutationComplete(node);

        assert.equal(watcherCalls, 2, "2 watcher calls");
        assert.equal(node.list!.length, 4, "4 items in the node list");
        assert.equal(node.name, "ABC", "node name is ABC");

        unwatch(node, watchRef);

        node.name = "ABC2";

        node = await mutationComplete(node);

        assert.equal(watcherCalls, 2, "still 2 watcher calls");
        assert.equal(node.list!.length, 4, "4 items in the node list");
        assert.equal(node.name, "ABC2", "node name is now ABC2");
    });
});
