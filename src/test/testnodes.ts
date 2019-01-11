import { Dataset, value, dataset, datalist, datamap, list, computed } from "../hibe";

export let processLengthCounter = 0, defaultObject = { foo: "bar" };

/**
 * TestNode 
 * Definition when code generator is implemented
 */
@Dataset()
export class TestNode {
    @value() value = "v1";
    @dataset(TestNode) node: TestNode; // a TestNode will automatically be created at first get
    @dataset(TestNode, false) node2: TestNode | null; // undefined by default (not auto created)
}

/**
 * ValueNode
 * Node to test simple types and their defaults
 */
@Dataset()
export class ValueNode {
    @value() message = "hello";
    @value() isOK = true;
    @value() quantity = 42;
    @value() someObject = defaultObject;

    @value() message2;
    @value() isOK2;
    @value() quantity2;
    @value() someObject2;
}

@Dataset()
export class BaseTestNode {
    @value() value = "v1";
    @dataset(TestNode) node: TestNode;

    init() {
        this.value = "init value";
    }
}

@Dataset()
export class SubTestNode extends BaseTestNode {
    @value() quantity;

    init() {
        super.init(); // could be bypassed
        this.quantity = 42; // could be dynamic
    }
}

@Dataset()
export class InitNode {
    @dataset(TestNode) node;

    init() {
        let nd = new TestNode();
        nd.value = "new value";
        this.node = nd;
    }
}

@Dataset()
export class DsCustom {
    @value() value;
    @value() quantity;
    @value() foo;

    init() {
        this.value = "hello";
        this.quantity = 42;
        this.foo = { a: "bar" };
    }
}

/**
 * ArrTestNode 
 * Simple node to test lists
 */
@Dataset()
export class ArrTestNode {
    @value() name = "no name";
    @datalist(TestNode) list: (TestNode | null)[];

    @computed() get listLength() {
        processLengthCounter++;
        if (!this.list) return 0;
        return this.list.length;
    }
}

@Dataset()
export class TestList {
    @datalist(TestNode, false) list: TestNode[];
}

@Dataset()
export class TestMap {
    @datamap(TestNode, false) dict: Map<string, TestNode>;
}

@Dataset()
export class DictTestNode {
    @value() name = "map";
    @datamap(TestNode) dict: Map<string, TestNode | null>;
}

export function initNewArrTestNode(): ArrTestNode {
    let node10 = new ArrTestNode(),
        list = node10.list,
        itm = new TestNode();

    list.push(itm);
    itm.value = "i1";
    itm = new TestNode();
    list.push(itm);
    itm.value = "i2";
    itm = new TestNode();
    list.push(itm);
    itm.value = "i3";
    return node10;
}

@Dataset()
export class SimpleNode {
    @dataset(TestNode, true) node: TestNode;    // will be automatically created
    @dataset(list(TestNode)) list: TestNode[]; // will be automatically created as it is a list
    @value() data: any;
    @dataset(SimpleNode, false) subNode: SimpleNode | undefined; // will not be automatically created
}
