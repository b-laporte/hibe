import * as assert from 'assert';

describe('Proxies', () => {
    let logs: string[] = [];

    beforeEach(() => logs = []);

    it("should work for lists", async function () {
        // simple test to validate proxies on arrays - cf. HList

        let arr = [0, 111, 222];

        let RX_INT = /^\d+$/;

        let handler = {
            set: function (target, prop: string, value) {
                if (prop.match(RX_INT)) {
                    logs.push("list.set " + prop);
                }
                target[prop] = value;
                return true;
            },

            get: function (target, prop) {
                if (prop === "$isProxy") {
                    return true;
                }
                if (prop.match(RX_INT)) {
                    logs.push("list.get " + prop);
                } else if (prop === "splice") {
                    return function splice<T>(start: number, deleteCount: number | undefined, ...items: T[]): void {
                        logs.push("my splice")
                        target.splice(start, deleteCount); // etc.
                    }
                } else {
                    logs.push("list.getOther " + prop);
                }
                return target[prop];
            }
        }

        let p = new Proxy(arr, handler);
        assert.equal(p.$isProxy, true, "p is a proxy");
        p[4] = 400;
        p[2] = 200;
        p.abc = "abc";
        logs.push(p[1]);
        logs.push(p[2]);
        logs.push('length: ' + p.length);
        p.splice(1, 2);
        logs.push('length: ' + p.length);

        assert.deepEqual(logs, [
            'list.set 4',
            'list.set 2',
            'list.get 1',
            111,
            'list.get 2',
            200,
            'list.getOther length',
            'length: 5',
            'my splice',
            'list.getOther length',
            'length: 3'
        ], "logs");

    });

});
