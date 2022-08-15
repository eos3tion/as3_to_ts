import fs from "fs";
import path from "path";
export async function solveAst(dict: { [file: string]: AstNode }, callback: { (file: string, cnt: string) }, baseDir = "", filter: { (file: string): boolean } = _ => true) {
    for (const file in dict) {
        if (filter(file)) {
            await solveFileNode(file, dict, baseDir).then(v => callback(file, v));
        }
    }
}

interface Context {
    content: string;
}

function getBlank(node: AstNode, plus = 0) {
    const level = node.level + plus;
    let v = "";
    for (let i = 0; i < level; i++) {
        v += "\t";
    }
    return v;
}

async function solveFileNode(file: string, dict: { [file: string]: AstNode }, baseDir: string) {
    const fileNode = dict[file];
    const content = await fs.promises.readFile(file, "utf-8");
    //处理文件
    const context = {
        content,
    }
    const packageNode = fileNode.children[0];
    if (!packageNode) {
        return
    }
    const [fullNameNode, scopeNode] = packageNode.children;
    const pName = sovleIndentifierValue(fullNameNode.value);
    const pDir = pName.replaceAll(".", path.sep);
    const children = scopeNode.children;
    let v = "";
    for (let i = 0; i < children.length; i++) {
        //检查
        const node = children[i];
        switch (node.type) {
            case NodeName.ImportNode:
                v += solveImport(node, context) + "\n";
                break;
            case NodeName.ClassNode:
                v += solveClass(node, context) + "\n";
                break;
            case NodeName.InterfaceNode:
                v += solveInterface(node, context) + "\n";
                break;
            default:
                console.error(`[${file}]中未知节点:${node.type}`, node);
                break;
        }
    }
    return v;
    function solveImport(node: AstNode, context: Context) {
        //处理导入
        const value = sovleIndentifierValue(node.value);
        if (value.slice(-1) === "*") {
            console.log(`[${fileNode.file}]文件使用了${value}带"*"，请自行处理`);
            return "";
        }
        //尝试找到文件
        let imp = value.replaceAll(".", path.sep);
        let impName = path.basename(imp);
        let rela = path.relative(pDir, imp).replaceAll("\\", "/");
        if (!rela.startsWith(".")) {
            rela = "./" + rela;
        }
        return `import {${impName}} from "${rela}"`;
    }
}




type ClassDict = { [key: string]: AstNode };

interface ClassContext extends Context {
    dict: ClassDict;
}

function getChildIdx(children: AstNode[], start: number, type: NodeName, id?: NodeID) {
    let i = start;
    for (; i < children.length; i++) {
        const child = children[i];
        if (child.type === type && (id === undefined || child.id === id)) {
            return i;
        }
    }
    return -1;
}
function solveInterface(node: AstNode, context: Context) {
    const children = node.children;
    const lines = [] as string[];
    let name = sovleIndentifierValue(node.value);

    let extIdx = getChildIdx(children, 0, NodeName.KeywordNode, NodeID.KeywordExtendsID);
    let baseClassStr = "";
    if (extIdx > -1) {
        let baseClass = children[++extIdx];
        baseClassStr = ` extends ${sovleIndentifierValue(baseClass.value)} `;
    } else {
        extIdx = 0;
    }

    let scopeIdx = getChildIdx(children, extIdx, NodeName.ScopedBlockNode);
    let scope = children[scopeIdx];
    lines.push(`export interface ${name}${baseClassStr} {`);
    const cnt = {
        content: context.content,
        dict: {}
    };
    if (scope) {
        const children = scope.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            switch (child.type) {
                case NodeName.FunctionNode:
                    lines.push(getFunctionStr(child, cnt));
                    break;
                case NodeName.SetterNode:
                    lines.push(getSetterStr(child, cnt));
                    break;
                case NodeName.GetterNode:
                    lines.push(getGetterStr(child, cnt));
                    break;
                case NodeName.VariableNode:
                    lines.push(getVarStr(child, cnt));
                    break;
            }

        }
    }
    lines.push(`}`)
    return lines.join("\n");
}

function solveClass(node: AstNode, context: Context) {
    const children = node.children;
    const lines = [] as string[];
    let name = sovleIndentifierValue(node.value);
    let extIdx = getChildIdx(children, 0, NodeName.KeywordNode, NodeID.KeywordExtendsID);
    let baseClassStr = "";
    if (extIdx > -1) {
        let baseClass = children[++extIdx];
        baseClassStr = ` extends ${sovleIndentifierValue(baseClass.value)} `;
    } else {
        extIdx = 0;
    }

    let implIdx = getChildIdx(children, extIdx, NodeName.KeywordNode, NodeID.KeywordImplementsID);
    let implStr = "";
    if (implIdx > -1) {
        let contNode = children[++implIdx];
        if (contNode.type === NodeName.TransparentContainerNode) {
            implStr = ` implements ${getTransConStr(contNode)}`
        }
    } else {
        implIdx = extIdx;
    }


    let scopeIdx = getChildIdx(children, implIdx, NodeName.ScopedBlockNode);
    let scope = children[scopeIdx];

    lines.push(`export class ${name}${baseClassStr}${implStr} {`);
    if (scope) {
        lines.push(solveScope(scope, context, name));
    }
    lines.push(`}`)
    return lines.join("\n");
    function getTransConStr(node: AstNode) {
        let lines = [];
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            lines.push(sovleIndentifierValue(child.value));
        }
        return lines.join(",");
    }

    function solveScope(node: AstNode, context: Context, className: string) {
        const { content } = context;
        const children = node.children;
        const dict = {} as ClassDict;
        const setterDict = {} as ClassDict;
        const constuctors = [] as AstNode[];
        const others = [] as AstNode[];
        //第一次遍历，得到类中`属性/方法`
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            let name: string;
            switch (child.type) {
                case NodeName.FunctionNode:
                case NodeName.SetterNode:
                case NodeName.GetterNode:
                    name = getFunctionName(child);
                    break;
                case NodeName.VariableNode:
                    name = getVariableName(child);
                    break;
            }
            if (name) {
                if (className === name) {
                    constuctors.push(child);
                } else {
                    dict[name] = child;
                }
            } else {
                others.push(child);
            }
        }
        let lines = [] as string[];
        const clzCnt = {
            lines,
            content,
            dict
        }
        for (let i = 0; i < constuctors.length; i++) {
            const constuctor = constuctors[i];
            lines.push(getFunctionStr(constuctor, clzCnt, false, true));
            lines.push("");
        }
        //检查 block 中`属性/方法`的引用，是否需要加 `this.`
        //先输出属性
        for (let key in dict) {
            const dat = dict[key];
            if (dat.type === NodeName.VariableNode) {
                lines.push(getVarStr(dat, clzCnt, true));
                lines.push("");
            }
        }

        for (let key in dict) {
            const dat = dict[key];
            if (dat.type === NodeName.GetterNode) {
                lines.push(getGetterStr(dat, clzCnt));
                lines.push("");
                let setter = setterDict[key];
                if (setter) {//`getter`  `setter`  放一起
                    lines.push(getSetterStr(setter, clzCnt));
                    lines.push("");
                    delete setterDict[key];
                }
            }
        }

        //处理剩余的setter
        for (let key in setterDict) {
            lines.push(getSetterStr(setterDict[key], clzCnt));
            lines.push("");
        }

        //最后附加函数
        for (let key in dict) {
            const dat = dict[key];
            if (dat.type === NodeName.FunctionNode) {
                lines.push(getFunctionStr(dat, clzCnt));
                lines.push("");
            }
        }
        for (let i = 0; i < others.length; i++) {
            const other = others[i];
            lines.push(getNodeStr(other, clzCnt));
            lines.push("");
        }
        return lines.join("\n");
    }

    function getVariableName(node: AstNode) {
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.type === NodeName.KeywordNode) {//关键字
                const nameNode = children[i + 1];
                return sovleIndentifierValue(nameNode.value);
            }
        }
    }

    function getFunctionName(node: AstNode) {
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.type === NodeName.IdentifierNode) {
                return sovleIndentifierValue(child.value);
            }
        }
    }

}

function sovleIndentifierValue(msg: string | string[]) {
    if (typeof msg !== "string") {
        msg = msg[0];
    }
    return msg.slice(1, -1);
}


const as2tsType = {
    "Number": "number",
    "int": "number",
    "*": "any",
    "Object": "any",
    "String": "string",
    "Boolean": "boolean",
    "Array": "any[]",
} as { [type: string]: string }
function getTSType(type: string) {
    if (type in as2tsType) {
        return as2tsType[type];
    }
    return type;
}

function getParamNodeString(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let [paramNameNode, paramTypeNode, defaultNode] = children;
    let v = "";
    if (node.start !== paramNameNode.start) {//检查是否是 `...`
        let p = clzCnt.content.substring(node.start, paramNameNode.start).trim();
        if (p === "...") {
            v = "...";
        }
    }
    v += solveParam(paramNameNode, paramTypeNode, defaultNode, clzCnt);
    return v;
}

function solveParam(paramNameNode: AstNode, paramTypeNode: AstNode, defaultNode: AstNode, clzCnt: ClassContext) {
    let v = `${sovleIndentifierValue(paramNameNode.value)}:${getTSType(getNodeStr(paramTypeNode, clzCnt))}`;
    if (defaultNode) {
        let val = getNodeStr(defaultNode, clzCnt);
        v += ` = ${val}`;
    }
    return v;
}

function getNamespaceIdent(node: AstNode) {
    let v = sovleIndentifierValue(node.value);
    if (v === "public") {
        v = "";
    } else {
        v += " ";
    }
    return v;
}

function getStaticString(isStatic: boolean) {
    let v = "";
    if (isStatic) {
        v = "static "
    }
    return v;
}


function getLiteralStr(node: AstNode, clzCnt: ClassContext) {
    let [, value] = node.value as string;
    return value;
}

function checkAddThis(node: AstNode, clzCnt: ClassContext) {
    let v = sovleIndentifierValue(node.value);
    if (v in clzCnt.dict) {//成员变量
        v = `this.${v}`;
    }
    return v;
}

function getLeftRightStr(node: AstNode, clzCnt: ClassContext, middle: string) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = getLeftStr(leftNode, clzCnt);
    let right = getNodeStr(rightNode, clzCnt);
    return `${left}${middle}${right}`;
}

function getDynamicAccessStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = getLeftStr(leftNode, clzCnt);
    let right = getNodeStr(rightNode, clzCnt);
    return `${left}[${right}]`;
}

function getTernaryStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [conNode, leftNode, rightNode] = children;
    let con = getNodeStr(conNode, clzCnt);
    let left = getLeftStr(leftNode, clzCnt);
    let right = getNodeStr(rightNode, clzCnt);
    return `${con} ? ${left} : ${right}`;
}

function getLeftStr(node: AstNode, clzCnt: ClassContext) {
    let left: string;
    if (node.type === NodeName.IdentifierNode) {//左值已经是最基本的标识符节点
        left = checkAddThis(node, clzCnt);
    } else {
        left = getNodeStr(node, clzCnt);
    }
    return left;
}


function getIfNodeStr(node: AstNode, clzCnt: ClassContext) {
    let lines = [] as string[];
    const children = node.children;
    let mainBlank = getBlank(node);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeName.ConditionalNode) {//children只能是ConditionNode
            const subs = child.children;
            //只会有 0-2 个子节点
            //最多一个 conditionalNode 和一个 contentsNode
            if (subs.length === 2) {
                let [con, cnt] = subs;
                let prefix = i === 0 ? "if" : "else if";
                lines.push(`${mainBlank}${prefix}(${getNodeStr(con, clzCnt)}) `);
                lines.push(getNodeStr(cnt, clzCnt));
            } else {
                console.log(`条件节点没有2个子节点`, child);
            }
        }
    }
    return lines.join("\n");
}

function getMemberAccessExpressionNodeStr(node: AstNode, clzCnt: ClassContext) {
    return getLeftRightStr(node, clzCnt, ".");
}

function getNodeStr(node: AstNode, clzCnt: ClassContext) {
    switch (node.type) {
        case NodeName.MemberAccessExpressionNode:
            return getMemberAccessExpressionNodeStr(node, clzCnt);

        case NodeName.NilNode:
        case NodeName.MetaTagsNode:
            return "";
        case NodeName.TernaryOperatorNode:
            return getTernaryStr(node, clzCnt);
        case NodeName.VariableNode:
            return getVarStr(node, clzCnt);
        case NodeName.LiteralNode:
        case NodeName.NumericLiteralNode:
            return getLiteralStr(node, clzCnt);
        case NodeName.FunctionCallNode:
            return getFuncCallStr(node, clzCnt);
        case NodeName.ParameterNode:
            return getParamNodeString(node, clzCnt);
        case NodeName.ObjectLiteralValuePairNode:
            return getObjKVStr(node, clzCnt);
        case NodeName.LanguageIdentifierNode:
            return sovleIndentifierValue(node.value);
        case NodeName.IdentifierNode://变量那些，最好不走这个，没法判断是否加`this`
            return sovleIndentifierValue(node.value);
        case NodeName.ChainedVariableNode:
            return getChainVarStr(node, clzCnt);
        case NodeName.TypedExpressionNode:
            return getTypedExpressStr(node, clzCnt);
        case NodeName.DynamicAccessNode:
            return getDynamicAccessStr(node, clzCnt);
        case NodeName.FunctionObjectNode:
            return getFunctionStr(node.children[0], clzCnt, true);
        //========== BinaryOperator ==================================
        case NodeName.BinaryOperatorCommaNode:
            return getLeftRightStr(node, clzCnt, ", ");
        case NodeName.BinaryOperatorAsNode:
            return getLeftRightStr(node, clzCnt, " as ");
        case NodeName.BinaryOperatorInNode:
            return getLeftRightStr(node, clzCnt, " in ");
        case NodeName.BinaryOperatorInstanceOfNode:
        case NodeName.BinaryOperatorIsNode:
            return getLeftRightStr(node, clzCnt, " instanceof ");
        case NodeName.BinaryOperatorAssignmentNode:
            return getLeftRightStr(node, clzCnt, " = ");
        //============ BinaryOperatorMath =================
        case NodeName.BinaryOperatorPlusNode:
            return getLeftRightStr(node, clzCnt, " + ");
        case NodeName.BinaryOperatorPlusAssignmentNode:
            return getLeftRightStr(node, clzCnt, " += ");
        case NodeName.BinaryOperatorMinusNode:
            return getLeftRightStr(node, clzCnt, " - ");
        case NodeName.BinaryOperatorMinusAssignmentNode:
            return getLeftRightStr(node, clzCnt, " -= ");
        case NodeName.BinaryOperatorMultiplicationNode:
            return getLeftRightStr(node, clzCnt, " * ");
        case NodeName.BinaryOperatorMultiplicationAssignmentNode:
            return getLeftRightStr(node, clzCnt, " *= ");
        case NodeName.BinaryOperatorDivisionNode:
            return getLeftRightStr(node, clzCnt, " / ");
        case NodeName.BinaryOperatorDivisionAssignmentNode:
            return getLeftRightStr(node, clzCnt, " /= ");
        case NodeName.BinaryOperatorModuloNode:
            return getLeftRightStr(node, clzCnt, " % ");
        case NodeName.BinaryOperatorModuloAssignmentNode:
            return getLeftRightStr(node, clzCnt, " %= ");
        //============ BinaryOperatorBitwise =================
        case NodeName.BinaryOperatorBitwiseAndNode:
            return getLeftRightStr(node, clzCnt, " & ");
        case NodeName.BinaryOperatorBitwiseAndAssignmentNode:
            return getLeftRightStr(node, clzCnt, " &= ");
        case NodeName.BinaryOperatorBitwiseLeftShiftNode:
            return getLeftRightStr(node, clzCnt, " << ");
        case NodeName.BinaryOperatorBitwiseLeftShiftAssignmentNode:
            return getLeftRightStr(node, clzCnt, " <<= ");
        case NodeName.BinaryOperatorBitwiseOrNode:
            return getLeftRightStr(node, clzCnt, " | ");
        case NodeName.BinaryOperatorBitwiseOrAssignmentNode:
            return getLeftRightStr(node, clzCnt, " |= ");
        case NodeName.BinaryOperatorBitwiseRightShiftNode:
            return getLeftRightStr(node, clzCnt, " >> ");
        case NodeName.BinaryOperatorBitwiseRightShiftAssignmentNode:
            return getLeftRightStr(node, clzCnt, " >>= ");
        case NodeName.BinaryOperatorBitwiseUnsignedRightShiftNode:
            return getLeftRightStr(node, clzCnt, " >>> ");
        case NodeName.BinaryOperatorBitwiseUnsignedRightShiftAssignmentNode:
            return getLeftRightStr(node, clzCnt, " >>>= ");
        case NodeName.BinaryOperatorBitwiseXorNode:
            return getLeftRightStr(node, clzCnt, " ^ ");
        case NodeName.BinaryOperatorBitwiseXorAssignmentNode:
            return getLeftRightStr(node, clzCnt, " ^= ");
        //============ BinaryOperatorLogical =================
        case NodeName.BinaryOperatorEqualNode:
            return getLeftRightStr(node, clzCnt, " == ");
        case NodeName.BinaryOperatorStrictEqualNode:
            return getLeftRightStr(node, clzCnt, " === ");
        case NodeName.BinaryOperatorNotEqualNode:
            return getLeftRightStr(node, clzCnt, " != ");
        case NodeName.BinaryOperatorStrictNotEqualNode:
            return getLeftRightStr(node, clzCnt, " !== ");
        case NodeName.BinaryOperatorGreaterThanNode:
            return getLeftRightStr(node, clzCnt, " > ");
        case NodeName.BinaryOperatorGreaterThanEqualsNode:
            return getLeftRightStr(node, clzCnt, " >= ");
        case NodeName.BinaryOperatorLessThanNode:
            return getLeftRightStr(node, clzCnt, " < ");
        case NodeName.BinaryOperatorLessThanEqualsNode:
            return getLeftRightStr(node, clzCnt, " <= ");
        case NodeName.BinaryOperatorLogicalAndNode:
            return getLeftRightStr(node, clzCnt, " && ");
        case NodeName.BinaryOperatorLogicalAndAssignmentNode:
            return getLeftRightStr(node, clzCnt, " &&= ");
        case NodeName.BinaryOperatorLogicalOrNode:
            return getLeftRightStr(node, clzCnt, " || ");
        case NodeName.BinaryOperatorLogicalOrAssignmentNode:
            return getLeftRightStr(node, clzCnt, " ||= ");
        //================UnaryOperator=============
        case NodeName.UnaryOperatorPreIncrementNode:
            return getUnaryLeftStr(node, clzCnt, "++");
        case NodeName.UnaryOperatorPostIncrementNode:
            return getUnaryRightStr(node, clzCnt, "++");
        case NodeName.UnaryOperatorPreDecrementNode:
            return getUnaryLeftStr(node, clzCnt, "--");
        case NodeName.UnaryOperatorPostDecrementNode:
            return getUnaryRightStr(node, clzCnt, "--");
        case NodeName.UnaryOperatorAtNode:
            throw Error(`不允许使用@,[${node.root.file}]`);
        case NodeName.UnaryOperatorLogicalNotNode:
            return getUnaryLeftStr(node, clzCnt, "!");
        case NodeName.UnaryOperatorBitwiseNotNode:
            return getUnaryLeftStr(node, clzCnt, "~");
        case NodeName.UnaryOperatorPlusNode:
            return getUnaryLeftStr(node, clzCnt, "+");
        case NodeName.UnaryOperatorMinusNode:
            return getUnaryLeftStr(node, clzCnt, "-");
        case NodeName.UnaryOperatorVoidNode:
            return getUnaryLeftStr(node, clzCnt, "void ");
        case NodeName.UnaryOperatorDeleteNode:
            return getUnaryLeftStr(node, clzCnt, "delete ");
        case NodeName.UnaryOperatorTypeOfNode:
            return getUnaryLeftStr(node, clzCnt, "typeof ");
        //===================容器类==========================================
        case NodeName.ArrayLiteralNode:
            return getArrStr(node, clzCnt);
        case NodeName.ObjectLiteralNode:
            return getObjStr(node, clzCnt);
        case NodeName.VectorLiteralNode:
            return getVecStr(node, clzCnt);
        case NodeName.ScopedBlockNode:
        case NodeName.BlockNode:
            return getBlockStr(node, clzCnt);
        case NodeName.ContainerNode:
            return getConStr(node, clzCnt);
        //========流程控制====================
        case NodeName.TryNode:
            return getTryStr(node, clzCnt);
        case NodeName.CatchNode:
            return getCatchStr(node, clzCnt);
        case NodeName.TerminalNode:
            return getTerminalStr(node, clzCnt);
        case NodeName.IterationFlowNode:
            return getIterationFlowStr(node, clzCnt);
        case NodeName.LabeledStatementNode:
            return getLabelStr(node, clzCnt);
        case NodeName.IfNode:
            return getIfNodeStr(node, clzCnt);
        case NodeName.ReturnNode:
            return getReturnStr(node, clzCnt);
        case NodeName.ForLoopNode:
            return getForLoopStr(node, clzCnt);
        case NodeName.WhileLoopNode:
            return getWhileLoopStr(node, clzCnt);
        case NodeName.DoWhileLoopNode:
            return getDoWhileLoopStr(node, clzCnt);

    }
}

function getVarStr(node: AstNode, clzCnt: ClassContext, isClass?: boolean) {
    const children = node.children;
    let ident = "";
    let find = -1;
    let isConst = false;
    let isStatic = false;

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const type = child.type;
        if (type === NodeName.NamespaceIdentifierNode) {
            ident = getNamespaceIdent(child);
        } else if (type === NodeName.ModifiersContainerNode) {
            const sub = child.children[0];
            if (sub && sub.value === `"static"`) {
                isStatic = true;
            }
        } else if (type === NodeName.KeywordNode) {//关键字
            if (child.value === `"const"`) {
                isConst = true;
            }
            find = i + 1;
            break;
        }
    }

    const nameNode = children[find];
    const typeNode = children[find + 1];
    const defaultNode = children[find + 2];

    let v = solveParam(nameNode, typeNode, defaultNode, clzCnt);
    if (isClass) {
        v = ident + getStaticString(isStatic) + v;
    } else {
        v = isConst ? "const " : "var " + v;//使用 `var` 不用 `let`，`as3`的`var`作用域和`js`一致
    }
    return v;
}

function getChainVarStr(node: AstNode, clzCnt: ClassContext) {
    const [nameNode, typeNode, defaultNode] = node.children;
    return ", " + solveParam(nameNode, typeNode, defaultNode, clzCnt) + "\n";
}


/**
 * 处理返回节点
 * @param node 
 * @param clzCnt 
 * @returns 
 */
function getReturnStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let v = `${getBlank(node)}return `;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const type = child.type;
        if (type === NodeName.IdentifierNode) {
            //检查是否为成员变量
            v += checkAddThis(child, clzCnt);
        } else {
            v += getNodeStr(child, clzCnt);
        }
    }
    return v;
}

function getForLoopStr(node: AstNode, clzCnt: ClassContext) {
    const [conditionNode, contentNode] = node.children;
    const id = node.id;
    if (id === NodeID.ForEachLoopID) {
        //for each(A in B) -> for(A of B)
        const nodeIn = conditionNode.children[0];
        return `for(${getLeftRightStr(nodeIn, clzCnt, " of ")}${getBlockStr(contentNode, clzCnt)}`;

    } else {//当 ForLoopID 处理 
        return `for${getConStr(conditionNode, clzCnt)}${getBlockStr(contentNode, clzCnt)}`

    }
}

function getWhileLoopStr(node: AstNode, clzCnt: ClassContext) {
    const [conditionNode, contentNode] = node.children;
    return `while${getConStr(conditionNode, clzCnt)}${getBlockStr(contentNode, clzCnt)}`
}

function getDoWhileLoopStr(node: AstNode, clzCnt: ClassContext) {
    const [contentNode, conditionNode] = node.children;
    return `do${getBlockStr(contentNode, clzCnt)}while${getConStr(conditionNode, clzCnt)}`
}

function getFunctionStr(node: AstNode, clzCnt: ClassContext, addFunc?: boolean, isConstructor?: boolean) {
    const children = node.children;
    let ident = "";
    let name: string;
    let retType: string = "";
    let params = [] as string[];
    let block: AstNode;
    let isStatic: boolean;
    let isOverride: boolean;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const type = child.type;
        if (type === NodeName.NamespaceIdentifierNode) {
            ident = getNamespaceIdent(child);
        } else if (type === NodeName.ModifiersContainerNode) {
            //检查 children
            const subs = child.children;
            for (let i = 0; i < subs.length; i++) {
                const sub = subs[i];
                if (sub.type === NodeName.ModifierNode) {
                    let v = sub.value;
                    if (v === `"static"`) {
                        isStatic = true;
                    } else if (v === `"override"`) {
                        isOverride = true;
                    }
                }
            }
        } else if (type === NodeName.IdentifierNode) {
            if (!name) {
                name = sovleIndentifierValue(child.value);
            } else {
                retType = getTSType(sovleIndentifierValue(child.value));
            }
        } else if (type === NodeName.ContainerNode) {//处理参数
            let subs = child.children;
            for (let i = 0; i < subs.length; i++) {
                params.push(getParamNodeString(subs[i], clzCnt));
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.LanguageIdentifierNode) {
            retType = getTSType(sovleIndentifierValue(child.value));
        }
    }
    if (retType) {
        retType = ":" + retType;
    }
    let override = "";
    if (isOverride) {
        override = "override ";
    }
    let paramsStr = params.join(",");
    let funcStr = "";
    if (addFunc) {
        funcStr = "function "
    }
    let v = isConstructor ? `constructor(${paramsStr})` : `${getBlank(node)}${override}${ident}${getStaticString(isStatic)}${funcStr}${name}(${paramsStr})${retType}`;
    if (block) {
        v += getBlockStr(block, clzCnt);
    }
    return v;
}



function getSetterStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let ident = "";
    let isStatic = false;
    let name = "";
    let retType = "";
    let block: AstNode;
    let paramString = "";
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const type = child.type;
        if (type === NodeName.NamespaceIdentifierNode) {
            ident = getNamespaceIdent(child);
        } else if (type === NodeName.ModifiersContainerNode) {
            const sub = child.children[0];
            if (sub && sub.value === `"static"`) {
                isStatic = true;
            }
        } else if (type === NodeName.IdentifierNode) {//关键字
            if (!name) {
                name = sovleIndentifierValue(child.value);
            } else {
                retType = getTSType(sovleIndentifierValue(child.value));
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.ContainerNode) {
            let sub = child.children[0];
            if (sub.type === NodeName.ParameterNode) {
                paramString = getParamNodeString(node, clzCnt);
            }
        } else if (type === NodeName.LanguageIdentifierNode) {
            retType = getTSType(sovleIndentifierValue(child.value));
        }
    }
    if (retType) {
        retType = ":" + retType;
    }
    let v = `${getBlank(node)}${ident}${getStaticString(isStatic)}set ${name}(${paramString})${retType}`;
    if (block) {
        v += getBlockStr(block, clzCnt);
    }
    return v;
}


function getGetterStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let ident = "";
    let isStatic = false;
    let name = "";
    let retType = "";
    let block: AstNode;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const type = child.type;
        if (type === NodeName.NamespaceIdentifierNode) {
            ident = getNamespaceIdent(child);
        } else if (type === NodeName.ModifiersContainerNode) {
            const sub = child.children[0];
            if (sub && sub.value === `"static"`) {
                isStatic = true;
            }
        } else if (type === NodeName.IdentifierNode) {//关键字
            if (!name) {
                name = sovleIndentifierValue(child.value);
            } else {
                retType = getTSType(sovleIndentifierValue(child.value));
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.LanguageIdentifierNode) {
            retType = getTSType(sovleIndentifierValue(child.value));
        }
    }
    if (retType) {
        retType = ":" + retType;
    }
    let v = `${getBlank(node)}${ident}${getStaticString(isStatic)}get ${name}()${retType}`;
    if (block) {
        v += getBlockStr(block, clzCnt);
    }
    return v;
}


function getObjStr(node: AstNode, clzCnt: ClassContext) {
    const container = node.children[0];
    let v = "";
    if (container) {
        const lines = [] as string[];
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            lines.push(getObjKVStr(child, clzCnt));
        }
        v = `{${lines.join(", ")}}`;
    }
    return v;
}
function getObjKVStr(node: AstNode, clzCnt: ClassContext) {
    const [keyNode, valueNode] = node.children;
    return `${sovleIndentifierValue(keyNode.value)} : ${getNodeStr(valueNode, clzCnt)}`
}

function getArrStr(node: AstNode, clzCnt: ClassContext) {
    const container = node.children[0];
    let v = "";
    if (container) {
        const lines = [] as string[];
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            lines.push(getNodeStr(child, clzCnt));
        }
        v = `[${lines.join(", ")}]`;
    }
    return v;
}

function getTypedExpressStr(node: AstNode, clzCnt: ClassContext) {
    const [_, typeNode] = node.children;
    let type = "any";
    if (typeNode) {
        if (typeNode.type === NodeName.IdentifierNode) {
            type = getTSType(sovleIndentifierValue(typeNode.value));
        } else {
            type = getNodeStr(typeNode, clzCnt);
        }
    }
    return `Array<${type}>`;
}

function getVecStr(node: AstNode, clzCnt: ClassContext) {
    const [idNode, container] = node.children;
    let v = "";
    if (idNode && container) {
        const lines = [] as string[];
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            lines.push(getNodeStr(child, clzCnt));
        }
        v = `Array<${getTSType(sovleIndentifierValue(idNode.value))}>(${lines.join(", ")})`;
    }
    return v;
}

function getBlockStr(node: AstNode, clzCnt: ClassContext) {
    if (node.value === "SYNTHESIZED") {
        return "";
    }
    let lines = ["{"] as string[];
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        lines.push(getNodeStr(child, clzCnt));
    }
    lines.push("}");
    return lines.join("\n");
}

function getConStr(node: AstNode, clzCnt: ClassContext, spe = "") {
    const children = node.children;
    let childs = [] as string[];
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeName.IdentifierNode) {
            childs.push(checkAddThis(child, clzCnt));
        } else {
            childs.push(getNodeStr(child, clzCnt));
        }
    }
    return `(${childs.join(spe)})`
}


function getFuncCallStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let i = 0;
    let v = "";
    let child = children[i];
    if (child.type === NodeName.KeywordNode) {// new
        v = "new ";
        i++;
    }
    let nameNode = children[i++];
    v += getNodeStr(nameNode, clzCnt);
    v += getConStr(children[i], clzCnt, ",");
    return v;
}

function getTryStr(node: AstNode, clzCnt: ClassContext) {
    let v = "try";
    let children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        v += getNodeStr(child, clzCnt);
    }
    return v;
}

function getCatchStr(node: AstNode, clzCnt: ClassContext) {
    const [argNode, cntNode] = node.children;
    return `catch(${getParamNodeString(argNode, clzCnt)})${getBlockStr(cntNode, clzCnt)}`;
}

function getTerminalStr(node: AstNode, clzCnt: ClassContext) {
    let v = "";
    switch (node.id) {
        case NodeID.DefaultID:
            v = "default:";
            break
        case NodeID.ElseID:
            v = "else";
            break
        case NodeID.FinallyID:
            v = "finally";
            break
    }
    const block = node.children[0];
    if (block) {
        v += getBlockStr(block, clzCnt);
    }
    return v;
}

function getIterationFlowStr(node: AstNode, clzCnt: ClassContext) {
    let v = "";
    switch (node.id) {
        case NodeID.BreakID:
            v = "break";
            break
        case NodeID.ContinueID:
            v = "continue";
            break;
        case NodeID.GotoID:
            console.error(`请勿使用"goto"`, node);
            break;
    }
    const label = node.children[0];
    if (label) {
        v += " " + sovleIndentifierValue(label.value)
    }
    v += ";\n"
    return v;
}

function getLabelStr(node: AstNode, clzCnt: ClassContext) {
    const [idNode, statementNode] = node.children;
    let v = sovleIndentifierValue(idNode.value);
    v += getNodeStr(statementNode, clzCnt);
    return v;
}

function getUnaryRightStr(node: AstNode, clzCnt: ClassContext, right: string) {
    const child = node.children[0];
    let v = getNodeStr(child, clzCnt);
    return `${v}${right}`;
}

function getUnaryLeftStr(node: AstNode, clzCnt: ClassContext, left: string) {
    const child = node.children[0];
    let v = getNodeStr(child, clzCnt);
    return `${left}${v}`;
}