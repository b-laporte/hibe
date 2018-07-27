import * as assert from 'assert';
import { SimpleNode, StNode, defaultObject } from "./testnodes";
import { isMutating, mutationComplete } from '../hibe';

describe('simple types', () => {
    
    it("should support default value override for simple type properties", function () {
        let nd = new StNode();
        assert.equal(nd.isOK, true, "boolean override");
        assert.equal(nd.message, "hello", "string override");
        assert.equal(nd.quantity, 42, "number override");
        assert.equal(nd.someObject, defaultObject, "object override");

        assert.equal(nd.isOK2, false, "boolean default");
        assert.equal(nd.message2, "", "string default");
        assert.equal(nd.quantity2, 0, "number default");
        assert.equal(nd.someObject2, null, "object default");
    });

    it("should accept any kind of object for @object", async function () {
        let nd = new SimpleNode();

        nd.data = { a: "property A", b: 123 };
        assert.equal(isMutating(nd), true, "nd is mutating");
        assert.equal(nd.subNode, undefined, "subNode is undefined");

        nd = await mutationComplete(nd);
        assert.deepEqual(nd.data, { a: "property A", b: 123 }, "nd.data has been properly set");

        nd.data.a = "another value";
        assert.equal(isMutating(nd), false, "nd is not mutating after data internal change");
        nd.data = { a: "yet another thing", b: 123 };
        assert.equal(isMutating(nd), true, "nd is mutating after data ref change");

        nd = await mutationComplete(nd);
        assert.deepEqual(nd.data, { a: "yet another thing", b: 123 }, "nd.data has been properly set");

        nd.data = undefined;
        assert.equal(isMutating(nd), true, "nd is mutating after data set to undefined");

        nd = await mutationComplete(nd);
        assert.equal(nd.data, undefined, "nd.data is now undefined");

        nd.data = null;
        assert.equal(isMutating(nd), true, "nd is mutating after data set to null");

        nd = await mutationComplete(nd);
        assert.equal(nd.data, null, "nd.data is now null");
    });
});