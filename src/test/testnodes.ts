import { Data, value, data, datalist, datamap, list, computed } from "../hibe";

export let processLengthCounter = 0, defaultObject = { foo: "bar" };

/**
 * TestNode 
 * Definition when code generator is implemented
 */
@Data() export class TestNode {
    value = "v1";
    @data(TestNode) node: TestNode; // a TestNode will automatically be created at first get
    @data(TestNode, false) node2: TestNode | null; // undefined by default (not auto created)
}

/**
 * ValueNode
 * Node to test simple types and their defaults
 */
@Data() export class ValueNode {
    message = "hello";
    isOK = true;
    quantity = 42;
    someObject = defaultObject;

    @value() message2; // @value is mandatory if property is not initialized
    @value() isOK2;
    @value() quantity2;
    @value() someObject2;
}

@Data() export class BaseTestNode {
    value = "v1";
    @data(TestNode) node: TestNode;

    init() {
        this.value = "init value";
    }
}

@Data() export class SubTestNode extends BaseTestNode {
    quantity = 0;

    init() {
        super.init(); // could be bypassed depending on application logic
        this.quantity = 42; // could be dynamic
    }
}

@Data() export class InitNode {
    @data(TestNode) node;

    init() {
        let nd = new TestNode();
        nd.value = "new value";
        this.node = nd;
    }
}

@Data() export class DsCustom {
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
@Data() export class ArrTestNode {
    name = "no name";
    @datalist(TestNode) list: (TestNode | null)[];

    @computed() get listLength() {
        processLengthCounter++;
        if (!this.list) return 0;
        return this.list.length;
    }
}

@Data() export class TestList {
    @datalist(TestNode, false) list: TestNode[];
}

@Data() export class TestMap {
    @datamap(TestNode, false) dict: Map<string, TestNode>;
}

@Data() export class DictTestNode {
    name = "map";
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

@Data() export class SimpleNode {
    @data(TestNode, true) node: TestNode;    // will be automatically created
    @data(list(TestNode)) list: TestNode[]; // will be automatically created as it is a list
    data:any = null;
    @data(SimpleNode, false) subNode: SimpleNode | undefined; // will not be automatically created
}
