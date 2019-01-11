import { TestNode } from "./testnodes";
import * as assert from 'assert';
import { log, lastDatasetId, mutationComplete, list, map, load } from '../hibe';

describe('Log', () => {
    let offset = 0;
    beforeEach(() => {
        offset = -lastDatasetId();
    })

    it("should work with simple datasets", async function () {
        let nd = new TestNode(), out: string[] = [];

        nd["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 no-parents",
            "  value: v1"
        ], "log 1");

        nd.node.value = "ABC";

        nd["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 MUTATING no-parents -> $mn:#4",
            "  $mn.value: v1",
            "  $mn.node: [TestNode]#2 MUTATING parent:#1 -> $mn:#3",
            "    $mn.value: ABC"
        ], "log 2");

        let nd2 = await mutationComplete(nd);

        nd["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 IMMUTABLE no-parents -> $next:#4",
            "  value: v1",
            "  node: [TestNode]#2 IMMUTABLE no-parents -> $next:#3",
            "    value: v1"
        ], "log 3");

        nd2["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#4 no-parents",
            "  value: v1",
            "  node: [TestNode]#3 parent:#4",
            "    value: ABC"
        ], "log 4");
    });

    it("should detect parent/child mismatches", async function () {
        let nd = new TestNode(), out: string[] = [];

        nd.node.value = "ABC";

        nd["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 MUTATING no-parents -> $mn:#4",
            "  $mn.value: v1",
            "  $mn.node: [TestNode]#2 MUTATING parent:#1 -> $mn:#3",
            "    $mn.value: ABC"
        ], "log 1");

        // remove the parent
        nd["$mn"].$$node.$dmd.parents = [];
        nd["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 MUTATING no-parents -> $mn:#4",
            "  $mn.value: v1",
            "  $mn.node: [TestNode]#2 MUTATING no-parents=>** ERROR ** -> $mn:#3",
            "    $mn.value: ABC"
        ], "log 2");

        // set an invalid parent
        nd["$mn"].$$node.$dmd.parents = [new TestNode()];
        nd["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 MUTATING no-parents -> $mn:#4",
            "  $mn.value: v1",
            "  $mn.node: [TestNode]#2 MUTATING parent:#5=>** ERROR ** -> $mn:#3",
            "    $mn.value: ABC"
        ], "log 3");
    });

    it("should work with lists", async function () {
        let l = list(list(TestNode)), out: string[] = [];

        l.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HList]Proxy(#2) no-parents"
        ], "log 1");

        let l0 = l.$newItem();

        l.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HList]Proxy(#2) MUTATING no-parents -> $mn:#4",
            "  $mn.0: [HList]Proxy(#3) parent:Proxy(#2)"
        ], "log 2");

        let l00 = l0.$newItem();

        l.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HList]Proxy(#2) MUTATING no-parents -> $mn:#4",
            "  $mn.0: [HList]Proxy(#3) MUTATING parent:Proxy(#2) -> $mn:#6",
            "    $mn.0: [TestNode]#5 parent:Proxy(#3)",
            "      value: v1"
        ], "log 3");

        l00.value = "v00";
        l.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HList]Proxy(#2) MUTATING no-parents -> $mn:#4",
            "  $mn.0: [HList]Proxy(#3) MUTATING parent:Proxy(#2) -> $mn:#6",
            "    $mn.0: [TestNode]#5 MUTATING parent:Proxy(#3) -> $mn:#7",
            "      $mn.value: v00"
        ], "log 4");

        let l2 = await mutationComplete(l);
        l.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HList]Proxy(#2) IMMUTABLE no-parents -> $next:#4"
        ], "log 5");

        l2.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HList]Proxy(#4) no-parents",
            "  0: [HList]Proxy(#6) parent:Proxy(#4)",
            "    0: [TestNode]#7 parent:Proxy(#6)",
            "      value: v00"
        ], "log 6");
    });

    it("should work with maps", async function () {
        let m = map(TestNode), out: string[] = [];

        m.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HMap]Proxy(#1) no-parents"
        ], "log 1");

        m.set("a", load({ value: "a" }, TestNode));
        m.set("b", load({ value: "b" }, TestNode));

        m.$log(3, out, offset);
        assert.deepEqual(out, [
            "[HMap]Proxy(#1) MUTATING no-parents -> $mn:#3",
            "  $mn.a: [TestNode]#2 parent:Proxy(#1)",
            "    value: a",
            "  $mn.b: [TestNode]#4 parent:Proxy(#1)",
            "    value: b"
        ], "log 2");
    });

    it("should properly handle depth argument", async function () {
        let nd = new TestNode(), out: string[] = [];

        nd.node.value = "ABC";
        nd.node.node.value = "DEF";

        nd["$log"](3, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 MUTATING no-parents -> $mn:#4",
            "  $mn.value: v1",
            "  $mn.node: [TestNode]#2 MUTATING parent:#1 -> $mn:#3",
            "    $mn.value: ABC",
            "    $mn.node: [TestNode]#5 MUTATING parent:#2 -> $mn:#6",
            "      $mn.value: DEF"
        ], "log 1");

        nd["$log"](1, out, offset);
        assert.deepEqual(out, [
            "[TestNode]#1 MUTATING no-parents -> $mn:#4",
            "  $mn.value: v1",
            "  $mn.node: [TestNode]#2 MUTATING parent:#1 -> $mn:#3",
            "    (...)"
        ], "log 2");

    });

});
