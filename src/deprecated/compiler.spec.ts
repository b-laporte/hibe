import * as assert from 'assert';
import { isHibeFile, compile, ErrorCtxt } from './compiler';


class ErrorContext implements ErrorCtxt {
    private messages: string[] = [];

    reset() {
        if (this.messages.length) {
            this.messages = [];
        }
    }
    warn(msg: string): void {
        this.messages.push("WARN: " + msg);
    }
    error(msg: string): void {
        this.messages.push("ERROR: " + msg);
    }
    toString(): string {
        return this.messages.length ? this.messages.join(", ") : "";
    }
    compare(arr: { type: string, msg: string, line: number, column: number, file: string }[]): string {
        if (this.messages.length !== arr.length) {
            return "Different error count";
        }
        let itm, msg = "";
        for (let i = 0; arr.length > i; i++) {
            itm = arr[i];
            msg = `${itm.type}: Hibe: ${itm.msg}\n\tfile: ${itm.file}\n\tline: ${itm.line}\n\tcolumn: ${itm.column}`;
            if (msg !== this.messages[i]) {
                return `Different messages[${i}]:\n\tactual:\n\t${this.messages[i]}\n\n\texpected:\n\t${msg}`;
            }
        }
        return "";
    }
}

describe('Compiler', () => {

    let err = new ErrorContext();


    beforeEach(function () {
        err.reset();
    })

    afterEach(function () {
        assert.equal(err.toString(), "", "No errors");
    })

    it('should identify files containing Datasets', function () {
        assert.equal(isHibeFile(`
            import { Dataset } from "../hibe"; 
            
            @Dataset
            export class TestNode {
                value: string = "v1"; // comment 1
                node: TestNode // comment 2
                // comment 3
                node2: TestNode | undefined; 
            }
    
            let foo = "bar";
        `), true, "file 1 contains Dataset");
        assert.equal(isHibeFile("hello\nworld"), false, "hello world doesn't contain any Dataset");
    });

    it('should ignore files flagged with specific comment', function () {
        let igFile = `
            // rollup-plugin-hibe:ignore
            import { Dataset } from "../hibe"; 
            
            @Dataset
            export class TestNode {
                value: string = "v1"; // comment 1
                node: TestNode // comment 2
                // comment 3
                node2: TestNode | undefined; 
            }
    
            let foo = "bar";
        `;

        assert.equal(isHibeFile(igFile), false, "file must be ignored");
    });

    it('should properly insert __h in imports', function () {
        let file3 = `import { __h, Dataset } from "../../hibe";`
        assert.equal(compile(`import { Dataset, List } from "../hibe";`, "./file", err), 'import { Dataset, __h, List } from "../hibe";', "h properly inserted when absent");
        assert.equal(compile(file3, "./file3", err), file3, "h not inserted when present");
    });

    it('should properly process empty datasets', function () {
        assert.equal(compile(`
            // file0
            @Dataset
            export class TestNode {
            }
        `, "file0", err), `
            // file0
            /* @Dataset */
            export class TestNode extends __h.HObject {
            }; __h.statics(TestNode,0,0,0);
        `, "@Dataset has been commented");
    });

    it('should properly process datasets with string and node types', function () {
        assert.equal(compile(`
            import { Dataset } from "../hibe"; 
            
            @Dataset
            export class TestNode {
                value: string = "v1"; // comment 1
                node: TestNode // comment 2
                // comment 3
                node2: TestNode | undefined; 
            }
    
            let foo = "bar";
        `, "file1", err), `
            import { Dataset, __h } from "../hibe"; 
            
            /* @Dataset */
            export class TestNode extends __h.HObject {
                $$value: string = "v1"; get value() {return __h.get(this, '$$value')}; set value(v) {__h.set(this, '$$value', v, 0)}; // comment 1
                $$node: TestNode; get node() {return __h.get(this, '$$node', 'node', TestNode, 1)}; set node(v) {__h.set(this, '$$node', v, 1)}; // comment 2
                // comment 3
                $$node2: TestNode | undefined; get node2() {return __h.get(this, '$$node2', 'node2', TestNode)}; set node2(v) {__h.set(this, '$$node2', v, 1)}; 
            }; __h.statics(TestNode,["value"],["node","node2"],0);
    
            let foo = "bar";
        `, "class has been modified");
    });

    it('should properly process datasets with List, boolean and number types', function () {
        assert.equal(compile(`
            import { Dataset } from "../hibe"; 
            @Dataset
            export class ArrTestNode {
                isImportant: boolean;
                quantity: number;
                list: List<TestNode>;
            };
        `, "file4", err), `
            import { Dataset, __h } from "../hibe"; 
            /* @Dataset */
            export class ArrTestNode extends __h.HObject {
                $$isImportant: boolean; get isImportant() {return __h.get(this, '$$isImportant')}; set isImportant(v) {__h.set(this, '$$isImportant', v, 0)};
                $$quantity: number; get quantity() {return __h.get(this, '$$quantity')}; set quantity(v) {__h.set(this, '$$quantity', v, 0)};
                $$list: List<TestNode>; get list() {return __h.get(this, '$$list', 'list', __h.hList(TestNode), 1)}; set list(v) {__h.set(this, '$$list', v, 1)};
            }; __h.statics(ArrTestNode,["isImportant","quantity"],["list"],0);;
        `);
    });

    it('should properly process datasets with processed properties', function () {
        assert.equal(compile(`
            import { Dataset } from "hibe"; 
            @Dataset
            class Foo {
                someProp: string;
                @processor(processLength, "someProp")
                propLength: number;
            }
        `, "file5", err), `
            import { Dataset, __h } from "hibe"; 
            /* @Dataset */
            class Foo extends __h.HObject {
                $$someProp: string; get someProp() {return __h.get(this, '$$someProp')}; set someProp(v) {__h.set(this, '$$someProp', v, 0)};
                /* @processor(processLength, "someProp") */
                /* propLength: number; */ get propLength() {return __h.retrieve(this, processLength, "$$propLength", "someProp")}
            }; __h.statics(Foo,["someProp"],0,["propLength"]);
        `);
    });

    it('should raise an error when constructors are used', function () {
        assert.equal(compile(`
            import { Dataset } from "hibe"; 

            @Dataset
            class Foo {
                someProp: string;

                constructor() {
                    this.someProp = "abcdedf";
                }
            }
        `, "FILE", err), "", "empty string should be returned in case of error");

        assert.equal(err.compare([{ type: "ERROR", msg: "Constructors are not authorized in datasets", line: 8, column: 17, file: "FILE" }]), "", "correct error message");
        err.reset();
    });

    it('should raise an error in case of invalid TS file', function () {
        assert.equal(compile(`
            fuction (a, b) {
                return a + b;
            }
        `, "FILE", err), "", "empty string should be returned in case of error");

        assert.equal(err.compare([{ type: "ERROR", msg: "TypeScript parsing error: ';' expected.", line: 2, column: 28, file: "FILE" }]), "", "correct error message");
        err.reset();
    });

    // todo raise error if invalid type identifier is used 

});
