import readline from "readline";
import fs from "fs";
import { checkNode, needCheck } from "./ParseASTNodeChecker";


export function readAstFile(file: string, callback: { (dict: { [file: string]: AstNode }): any }) {
    const stream = fs.createReadStream(file);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const dict = {} as { [file: string]: AstNode };

    let lastNode: AstNode | undefined;
    const ident = "  ";
    let lineNum = 0;
    let lastLine = "";
    /**
     * 是否有特殊节点
     */
    const specialNodes = [] as AstNode[];
    rl.on("line", line => {
        lineNum++;
        if (line === "") {//跳过空行
            return fileNodeEnd();
        }
        if (line.slice(-3) !== ".as") {
            if (line.slice(-1) !== "?") {
                lastLine += line + "\n";
                return
            }
            if (line.startsWith(NodeType.NilNode)) {
                return;
            }
        }
        line = lastLine + line;
        lastLine = "";
        //检查
        let start = 0;
        let end = start + 2;
        let level = 0;
        while (line.slice(start, end) === ident) {
            level++;
            start = level * 2;
            end = start + 2;
        }
        let cnt = line.slice(start);
        if (!cnt) {
            return
        }
        let data = cnt.split(" ");
        let i = 0;
        let nodeType = data[i++];
        const bracesStart = nodeType.indexOf("(");
        const bracesEnd = nodeType.indexOf(")");
        let type = nodeType.slice(0, bracesStart);
        let id = nodeType.slice(bracesStart + 1, bracesEnd);
        let vStart = i;
        let dataLen = data.length;
        while (true) {
            const tester = data[i++];
            if (tester === "?:?" || /^\d+:\d+$/.test(tester)) {
                //多检查一下下一个数据
                if (data[i] === "loc:") {
                    break;
                }
            }
            if (i > dataLen) {
                return
            }
        }
        let len = i - 1 - vStart;
        //顺序检查字符串，避免将`"new XX"`拆成多个
        let value: string | string[];
        if (len > 0) {
            if (len === 1) {
                value = data[vStart];
            } else {
                let v = data.slice(vStart, i - 1).join(" ");
                let vi = 0;
                let startIdx = 0;
                let list = [] as string[];
                let isQuote = false;
                let lastChar: string;
                while (vi < v.length) {
                    let vt = v.charAt(vi);
                    if (!isQuote && vt === " ") {
                        list.push(v.slice(startIdx, vi))
                        startIdx = vi + 1;
                    } else if (vt === "\"" && lastChar !== "\\") {
                        if (isQuote) {
                            isQuote = false;
                        } else {
                            isQuote = true;
                        }
                    }
                    lastChar = vt;
                    vi++;
                }
                list.push(v.slice(startIdx, vi));
                if (list.length === 1) {
                    value = list[0];
                } else {
                    value = list;
                }
            }
        }

        i++;//loc
        i++;//locValue
        i++;//abs
        let absValue = data[i++];
        let file = data[i++];
        let [startStr, endStr] = absValue.split("-");
        start = +startStr;
        end = +endStr;


        const node = {
            level,
            type,
            id,
            start,
            end,
            value,
            children: [] as AstNode[]
        } as AstNode;

        if (needCheck(type)) {
            specialNodes.push(node);
        }

        let hasErr = false;
        let isRoot = false;
        if (lastNode) {
            let curLevel = lastNode.level;
            if (level > curLevel) {
                if (level === curLevel + 1) {//子集
                    addChild(lastNode, node);
                } else {
                    hasErr = true;
                }
            } else {
                let deltaLevel = curLevel - level;
                let parent = lastNode.parent;
                if (parent) {
                    while (deltaLevel > 0) {
                        parent = parent.parent;
                        if (!parent) {
                            break
                        }
                        deltaLevel--;
                    }
                    if (parent) {
                        addChild(parent, node);
                    } else {
                        hasErr = true;
                    }
                } else {
                    isRoot = true;
                }
            }
        } else {
            isRoot = true;
        }
        if (isRoot) {
            let nod = setRootNode(node, file, dict);
            if (!nod) {
                hasErr = true;
            }
        }
        if (hasErr) {
            console.error(`${lineNum}行有误，请检查`);
        }
        lastNode = node;
    })
    rl.on("close", function () {
        fileNodeEnd();
        callback(dict);
    })

    function fileNodeEnd() {
        if (lastNode) {
            if (specialNodes.length) {
                const content = fs.readFileSync(lastNode.root.file, "utf-8");
                for (let i = 0; i < specialNodes.length; i++) {
                    const node = specialNodes[i];
                    checkNode(node, content);
                }
            }
            specialNodes.length = 0;
            lastNode = undefined;
        }
    }
}
function setRootNode(node: AstNode, file: string, dict: { [file: string]: AstNode }) {
    if (node.level === 0 && node.type === NodeType.FileNode) {
        node.file = file;
        node.root = node;
        dict[file] = node;
        return node;
    }
}
function addChild(parent: AstNode, child: AstNode) {
    parent.children.push(child);
    child.parent = parent;
    child.root = parent.root;
}
