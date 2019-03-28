import { SimpleNode, TestNode } from './testnodes';
import * as assert from 'assert';
import { commitMutations, lastDatasetId, latestVersion, mutationComplete, isMutating } from '../hibe';

describe('Global refresh', () => {

    it("should support commitMutations with no callbacks", async function () {
        let n = new SimpleNode();
        n.node.value = "node value";
        let tn0 = new TestNode();
        tn0.value = "n0 value";
        n.list.push(tn0);

        let nbrOfCallbacks = commitMutations();

        assert.equal(nbrOfCallbacks, 0, "no callbacks");

        assert.equal(n.node.value, "v1", "original node value");
        assert.equal(n.list.length, 0, "n list is empty");

        let n2 = latestVersion(n);
        assert.equal(n !== n2, true, "n has changed");
        assert.equal(n2.node.value, "node value", "new node value");
        assert.equal(n2.list.length, 1, "n2 list is not empty");
        assert.equal(n2.list[0].value, "n0 value", "n0 value");
    });

    it("should support commitMutations with callbacks", async function () {
        let n = new SimpleNode();
        n.node.value = "node value";
        let tn0 = new TestNode();
        tn0.value = "n0 value";
        n.list.push(tn0);

        let p1 = mutationComplete(n); // promise

        let nbrOfCallbacks = commitMutations();

        assert.equal(nbrOfCallbacks, 1, "1 callback");
        assert.equal(n.node.value, "v1", "original node value");
        assert.equal(n.list.length, 0, "n list is empty");
        assert.equal(isMutating(n), false, "n is not mutating");

        let n2 = latestVersion(n);
        assert.equal(n !== n2, true, "n has changed");
        assert.equal(n2.node.value, "node value", "new node value");
        assert.equal(n2.list.length, 1, "n2 list is not empty");
        assert.equal(n2.list[0].value, "n0 value", "n0 value");

        let n22 = await p1;
        assert.equal(n22 === n2, true, "mutationComplete returned n2");
    });

    it("should support multiple commitMutations with callbacks", async function () {
        let n = new SimpleNode();
        n.node.value = "node value";
        let tn0 = new TestNode();
        tn0.value = "n0 value";
        n.list.push(tn0);

        let p1 = mutationComplete(n); // promise

        let nbrOfCallbacks = commitMutations();

        assert.equal(nbrOfCallbacks, 1, "1 callback");
        assert.equal(n.node.value, "v1", "original node value");
        let n2 = latestVersion(n);
        assert.equal(n2.list.length, 1, "n2 list is not empty");

        // make new mutation
        n2.node.value = "n2 value";

        let p2 = mutationComplete(n2); // 2nd promise

        let nbrOfCallbacks2 = commitMutations();
        assert.equal(nbrOfCallbacks2, 1, "1 callback (p1 callback was removed)");

        assert.equal(n2.node.value, "node value", "n2 value ok");
        let n3 = latestVersion(n2);
        assert.equal(n3.node.value, "n2 value", "n3 value ok");

        let p1Result = await p1;
        assert.equal(p1Result === n3, true, "mutationComplete return latest version (1)");

        let p2Result = await p2;
        assert.equal(p2Result === n3, true, "mutationComplete return latest version (2)");
    });
});
