import { Dataset, List, hList, string, dataset, computed, object, boolean, number, hDictionary, Dictionary } from "../hibe";

export let processLengthCounter = 0, defaultObject = { foo: "bar" };

/**
 * TestNode 
 * Definition when code generator is implemented
 */
@Dataset
export class TestNode {
    @string() value = "v1";
    @dataset(TestNode, true) node: TestNode; // a node will be automatically created at first read if none is set before
    @dataset(TestNode) node2: TestNode | undefined | null; // node2 can be null (default value: undefined)
}

/**
 * StNode
 * Node to test simple types and their defaults
 */
@Dataset
export class StNode {
    @string() message = "hello";
    @boolean() isOK = true;
    @number() quantity = 42;
    @object() someObject = defaultObject;

    @string() message2;
    @boolean() isOK2;
    @number() quantity2;
    @object() someObject2;
}

@Dataset
export class BaseTestNode {
    @string() value = "v1";
    @dataset(TestNode, true) node: TestNode;

    init() {
        this.value = "init value";
    }
}


@Dataset
export class SubTestNode extends BaseTestNode {
    @number() quantity;

    init() {
        super.init(); // could be bypassed
        this.quantity = 42; // could be dynamic
    }
}

@Dataset
export class InitNode {
    @dataset(TestNode) node;

    init() {
        let nd = new TestNode();
        nd.value = "new value";
        this.node = nd;
    }
}

@Dataset
export class DsCustom {
    @string() value;
    @number() quantity;
    @object() foo;

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
@Dataset
export class ArrTestNode {
    @string() name = "no name";
    @dataset(hList(TestNode)) list: List<TestNode>;

    @computed() get listLength() {
        processLengthCounter++;
        if (!this.list) return 0;
        return this.list.length;
    }
}

@Dataset
export class DictTestNode {
    @string() name = "map";
    @dataset(hDictionary(TestNode)) dict: Dictionary<TestNode>;
}

export function initNewArrTestNode(): ArrTestNode {
    let node10 = new ArrTestNode(),
        list = node10.list = hList(TestNode)(),
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


@Dataset
export class SimpleNode {
    @dataset(TestNode, true) node: TestNode;    // will be automatically created
    @dataset(hList(TestNode)) list: List<TestNode>; // will be automatically created as it is a list
    @object() data;
    @dataset(SimpleNode) subNode: SimpleNode | undefined; // will not be automatically created
}
