import * as ts from "typescript";

export interface ErrorCtxt {
    warn: (msg: string) => void;
    error: (msg: string) => void;
}

const DATASET = "Dataset",
    PROCESSOR = "processor",
    H = "__h",
    RX_FILE = /\@Dataset/,
    RX_LIST_TYPE = /^List\<(.*)\>$/,
    RX_IGNORE_COMMENT = /\/\/\s*rollup-plugin-hibe:ignore/i,
    CR = "\n";

export function isHibeFile(source: string): boolean {
    return (!source.match(RX_IGNORE_COMMENT) && source.match(RX_FILE) !== null);
}

export function compile(source: string, filePath: string, ctxt: ErrorCtxt): string {
    let cc = new CompilationCtxt(source, filePath, ctxt);
    return cc.compile();
}

class CompilationCtxt {
    private srcFile: ts.SourceFile;
    private output: string;
    private outputShift = 0;

    constructor(private src: string, private filePath: string, private errCtxt: ErrorCtxt) { }

    compile(): string {
        let cc = this;
        this.srcFile = ts.createSourceFile(this.filePath, this.src, ts.ScriptTarget.Latest, /*setParentNodes */ true);

        function scan(node: ts.Node) {
            if (cc.processNode(node)) {
                ts.forEachChild(node, scan);
            }
        }

        // init output with input
        this.output = this.src;
        let diagnostics = this.srcFile['parseDiagnostics'];
        if (diagnostics && diagnostics.length) {
            let d: ts.Diagnostic = diagnostics[0] as any;
            this.logError("TypeScript parsing error: " + d.messageText.toString(), d.start || 0)
        } else {
            // process all parts
            scan(this.srcFile);
        }

        return this.output;
    }

    /**
     * Process a given node
     * @param node the node to process
     * @return boolean: true if child nodes need to be processed
     */
    private processNode(node: ts.Node): boolean {

        if (node.kind === ts.SyntaxKind.ImportClause) {
            return this.processImport(node as ts.ImportClause);
        } else if (node.kind === ts.SyntaxKind.ClassDeclaration) {
            return this.processClass(node as ts.ClassDeclaration);
        } else {
            //console.log("Node: ", node.kind)
            //debugger
        }

        return true;
    }

    private processImport(node: ts.ImportClause): boolean {
        // find the Dataset import to include the __h import (if not already there)
        if (node.namedBindings) {
            let nmi = <ts.NamedImports>node.namedBindings;
            if (nmi.elements) {
                let datasetEndPos = 0, idx = nmi.elements.length;
                while (idx--) {
                    if (nmi.elements[idx].name.text === DATASET) {
                        datasetEndPos = nmi.elements[idx].end;
                        break;
                    }
                }
                if (datasetEndPos) {
                    // determine if __h is not already inserted
                    let hFound = false;
                    idx = nmi.elements.length;
                    while (idx--) {
                        if (nmi.elements[idx].name.text === H) {
                            hFound = true;
                            break;
                        }
                    }
                    if (!hFound) {
                        this.insert(", " + H, datasetEndPos);
                    }
                }
            }
        }
        return false; // child node don't need to be processed
    }

    private processClass(node: ts.ClassDeclaration): boolean {
        let isDataset = false;
        if (node.decorators) {
            let decorators = node.decorators, idx = decorators.length, d: ts.Decorator;
            while (idx--) {
                d = decorators[idx];
                if (d.expression.kind === ts.SyntaxKind.Identifier && d.expression.getText() === DATASET) {
                    isDataset = true;
                    // comment the dataset expression to remove it from generated code (and don't impact line numbers)
                    this.insert("/* ", d.expression.pos - 1);
                    this.insert(" */", d.expression.end);
                    break;
                }
            }
        }
        if (!isDataset) {
            return false;
        }

        if (!node.name) {
            this.logError("Dataset class name must be defined", node.pos);
            return false;
        }

        // add "extends __h.HObject" to the class definition
        this.insert(" extends __h.HObject", node.name!.end);

        let simpleTypeProps: string[] = [], dataNodeProps: string[] = [], processedProps: string[] = [];

        // transform all properties into getter/setter
        if (node.members) {
            let members = node.members, name, isSimpleType = false, processedPropData: [string, string] | null, typeName: string, canBeUndefined: boolean;
            for (let i = 0, len = members.length; len > i; i++) {
                isSimpleType = false;
                canBeUndefined = false;
                typeName = "";
                let m = members[i];

                processedPropData = this.processProcessorDecorator(m);

                if (m.kind === ts.SyntaxKind.Constructor) {
                    this.logError("Constructors are not authorized in datasets", m.pos);
                    continue;
                } else if (m.kind !== ts.SyntaxKind.PropertyDeclaration) {
                    this.logError("Invalid Dataset member [kind: " + m.kind + "]", m.pos);
                    continue;
                }

                // add $$ in front of the property name
                m.forEachChild((c) => {
                    if (c.kind === ts.SyntaxKind.Identifier) {
                        name = c.getText();
                        if (processedPropData) {
                            this.insert("/* ", c.end - name.length);
                        } else {
                            this.insert("$$", c.end - name.length);
                        }
                    } else if (c.kind === ts.SyntaxKind.StringKeyword || c.kind === ts.SyntaxKind.BooleanKeyword || c.kind === ts.SyntaxKind.NumberKeyword) {
                        isSimpleType = true;
                    } else if (c.kind === ts.SyntaxKind.TypeReference) {
                        typeName = c.getText();
                    } else if (c.kind === ts.SyntaxKind.UnionType) {
                        // types should be either undefined or DataNode types
                        let ut = <ts.UnionTypeNode>c;
                        if (ut.types) {
                            let idx = ut.types.length;
                            while (idx--) {
                                let tp = ut.types[idx];
                                if (tp.kind === ts.SyntaxKind.TypeReference) {
                                    typeName = tp.getText();
                                } else if (tp.kind === ts.SyntaxKind.UndefinedKeyword) {
                                    canBeUndefined = true;
                                } else if (tp.kind !== ts.SyntaxKind.NullKeyword) {
                                    this.logError("Invalid property type", tp.pos);
                                }
                            }
                        }
                    }
                });
                if (processedPropData) {
                    processedProps.push(name);

                    // close comment and add new getter
                    this.insert([
                        " */ get ", name, "() ",
                        "{return __h.retrieve(this, ", processedPropData[0], ", \"$$", name, "\"", processedPropData[1], ")}"
                    ].join(''), m.end);;

                } else {
                    if (isSimpleType) {
                        simpleTypeProps.push(name);
                    } else if (typeName) {
                        dataNodeProps.push(name);
                    } else {
                        // todo
                        this.logError("Invalid property type", m.pos);
                    }

                    this.insert(getGetterAndSetter(getSeparator(m), name, typeName, canBeUndefined), m.end);
                }
            }
        }

        this.insert(getStatics(getSeparator(node), node.name!.getText(), simpleTypeProps, dataNodeProps, processedProps), node.end);
        return false;
    }

    /**
     * Analyze a class member and process its processor decorator
     * @param m the class member
     * @return tuple [processorFunctionName:string, argList:string]
     */
    private processProcessorDecorator(m: ts.ClassElement): [string, string] | null {
        if (m.decorators) {
            let decorators = m.decorators, idx = decorators.length, d: ts.Decorator;
            while (idx--) {
                d = decorators[idx];
                let e = d.expression;
                if (e.kind === ts.SyntaxKind.CallExpression && e.getChildAt(0).getText() === PROCESSOR) {
                    // this is a processor decorator
                    let ce: ts.CallExpression = d.expression as ts.CallExpression;

                    // comment decorator
                    this.insert("/* ", e.getChildAt(0).end - PROCESSOR.length - 1);
                    this.insert(" */", d.end);

                    // analyse arguments
                    if (!ce.arguments || !ce.arguments.length) {
                        this.logError("Invalid processor arguments", d.end);
                        break;
                    }
                    let processorFunc = "", arg: ts.Expression, args: string[] = [], txt: string;
                    for (let i = 0; ce.arguments.length > i; i++) {
                        arg = ce.arguments[i];
                        txt = arg.getText();
                        if (i === 0) {
                            // processor function
                            processorFunc = txt;
                        } else {
                            args.push(txt);
                            if (arg.kind !== ts.SyntaxKind.StringLiteral) {
                                this.logError("Processor arguments must be string literals referring to property names", arg.end - txt.length);
                                break
                            }
                        }
                    }

                    // return the getter code that needs to be inserted
                    // e.g. {return __h.retrieve(this, processLength, "$$listLength", "list")}

                    let argList = args.length ? ", " + args.join(", ") : "";
                    return [processorFunc, argList];
                }
            }
        }
        return null;
    }

    private logError(msg: string, pos: number) {
        // move pos to the first non-space character
        let s = this.src.slice(pos);
        if (s.match(/^([\s\n]+)/)) {
            pos += RegExp.$1.length;
        }

        // calculate line/col number and integrate file name in error msg
        let lines = this.src.split(CR), p = 0, line = 0, column;
        for (let ln; line < lines.length; line++) {
            ln = lines[line];
            if (p + ln.length < pos) {
                p += ln.length + 1; // + 1 for the CR at the end of the line
            } else {
                break;
            }
        }
        column = pos - p;
        this.errCtxt.error(`Hibe: ${msg}\n\tfile: ${this.filePath}\n\tline: ${line + 1}\n\tcolumn: ${column + 1}`);
        this.output = '';
    }

    /**
     * Insert some text at a given position in the output file
     * Note: the position should refer to the original position in the src file as multiple insert will shift the src file positions
     * @param text the text to insert
     * @param position the position at which the text should be inserted in the original source file
     */
    private insert(text: string, position: number) {
        // console.log("insert at", position, ": ", text);
        let o = this.output, pos = position + this.outputShift;
        if (o) {
            this.output = o.slice(0, pos) + text + o.slice(pos);
            this.outputShift += text.length;
        }
    }

}

function getSeparator(node: ts.Node): string {
    let tk = node.getLastToken();
    return (tk && tk.kind !== ts.SyntaxKind.SemicolonToken) ? "; " : " ";
}

function getGetterAndSetter(separator: string, propName: string, typeRef: string, canBeUndefined: boolean): string {
    // e.g. 
    // simple types: get value() { return __h.get(this, "$$value"); }; set value(v) { __h.set(this, "$$value", v, 0); };
    // node types: get node() { return __h.get(this, "$$node", "node", TestNodeGen); }; set node(v: TestNodeGen | undefined) { __h.set(this, "$$node", v, 1); };

    if (typeRef) {
        if (typeRef.match(RX_LIST_TYPE)) {
            // change typeRef into factory call
            typeRef = "__h.hList(" + RegExp.$1 + ")";
        }
        let uFlag = !canBeUndefined ? ", 1" : "";

        return [
            separator,
            "get ", propName, "() {return __h.get(this, '$$", propName, "', '", propName, "', ", typeRef, uFlag, ")}; ",
            "set ", propName, "(v) {__h.set(this, '$$", propName, "', v, 1)};"
        ].join('');
    } else {
        return [
            separator,
            "get ", propName, "() {return __h.get(this, '$$", propName, "')}; ",
            "set ", propName, "(v) {__h.set(this, '$$", propName, "', v, 0)};"
        ].join('');
    }
}

function getStatics(separator: string, className: string, simpleTypeProps: string[], dataNodeProps: string[], processedProps: string[]): string {
    // e.g.
    // __h.statics(TestNodeGen, ["value"], ["node", "node2"]);

    let getList = (arr: string[]) => arr.length ? '["' + arr.join('","') + '"]' : "0";

    return [
        separator, "__h.statics(",
        className, ",",
        getList(simpleTypeProps), ",",
        getList(dataNodeProps), ",",
        getList(processedProps),
        ");"
    ].join('');
}
