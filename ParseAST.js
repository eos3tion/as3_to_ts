"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function () { return m[k]; } });
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const readline = __importStar(require("readline"));
const fs = __importStar(require("fs"));
function readAstFile(file) {
    const stream = fs.createReadStream(file);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const dict = {};
    let curNode;
    const ident = "  ";
    let lineNum = 0;
    let lastLine = "";
    var speNode = {};
    rl.on("line", line => {
        lineNum++;
        if (line === "") { //跳过空行
            curNode = undefined;
            return;
        }
        if (line.slice(-3) !== ".as") {
            if (line.slice(-1) !== "?") {
                lastLine += line + "\n";
                return
            } else if (line.startsWith("NilNode")) {
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
            return;
        }
        let data = cnt.split(" ");
        let i = 0;
        let nodeType = data[i++];
        speNode[nodeType] = true;
        let value = "";
        let dataLen = data.length;
        while (true) {
            const tester = data[i++];
            if (tester === "?:?" || /\d+:\d+/.test(tester)) {
                break;
            } else {
                value += " " + tester;
            }
            if (i > dataLen) {
                return
            }
        }

        i++; //loc
        i++; //locValue
        i++; //abs
        let absValue = data[i++];
        let file = data[i++];
        let [startStr, endStr] = absValue.split("-");
        start = +startStr;
        end = +endStr;
        nodeType = nodeType.slice(0, nodeType.indexOf("("));
        const node = {
            level,
            type: nodeType,
            start,
            end,
            value,
            children: []
        };
        let hasErr = false;
        if (curNode) {
            let curLevel = curNode.level;
            if (level > curLevel) {
                if (level === curLevel + 1) { //子集
                    addChild(curNode, node);
                }
                else {
                    hasErr = true;
                }
            }
            else {
                let deltaLevel = curLevel - level;
                let parent = curNode.parent;
                if (parent) {
                    while (deltaLevel > 0) {
                        parent = parent.parent;
                        if (!parent) {
                            break;
                        }
                        deltaLevel--;
                    }
                    if (parent) {
                        addChild(parent, node);
                    }
                    else {
                        hasErr = true;
                    }
                }
                else {
                    let nod = setRootNode(node, file, dict);
                    if (!nod) {
                        hasErr = true;
                    }
                }
            }
        }
        else {
            let nod = setRootNode(node, file, dict);
            if (!nod) {
                hasErr = true;
            }
        }
        if (hasErr) {
            console.error(`${lineNum}行有误，请检查`);
        }
        curNode = node;
    });
    rl.on("close", function () {
        console.log(dict);
        console.log(Object.keys(speNode));
    });
}
function setRootNode(node, file, dict) {
    if (node.level === 0 && node.type === "FileNode" /* FileNode */) {
        node.file = file;
        // node.content = fs.readFileSync(file, "utf-8");
        dict[file] = node;
        return node;
    }
}
function addChild(parent, child) {
    parent.children.push(child);
    child.parent = parent;
}
console.log(readAstFile("ast1.txt"));
