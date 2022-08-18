import fs from "fs";
import path from "path";
import { ClassData, getClassData, isScopeNode } from "./GetScopeData";
import { getChildIdx, solveIdentifierValue } from "./Helper";

type FileContext = {
    pkgDict: { [pkg: string]: FileData[] },
    pathDict: { [path: string]: FileData }
    uriDict: { [uri: string]: FileData }
    nameDict: { [name: string]: FileData }
}

type FileData = ReturnType<typeof getFile>;

function getFile(file: string, node: AstNode, baseDir: string) {
    //全部以 baseDir 的相对路径创建 key
    const p = path.relative(baseDir, file)
        .slice(0, -3);//去除`.as`后缀
    const name = path.basename(p);

    //后续 as3 同 pkg 的类，可以直接引用， js都需要 import
    let pkg = "";
    /**
     * ```
     * import xx.xx.xxx;  
     * ```
     * 不带`*`的import
     */
    const imps = [] as string[];
    /**
     * ```
     * import xx.xx.xxx.*;  
     * ```
     * 这种带`*`的import
     */
    const impStars = [] as string[];
    const clzs = {} as { [name: string]: ClassData };
    //解析import节点
    const packageNode = node.children[0];

    const ints = {} as { [name: string]: AstNode };
    let scope: AstNode;
    if (packageNode) {
        scope = packageNode.children[1];
        pkg = solveIdentifierValue(packageNode.value);

        if (scope) {
            const children = scope.children;
            for (let i = 0; i < children.length; i++) {
                //检查
                const node = children[i];
                const nodeType = node.type;
                if (nodeType === NodeName.ImportNode) {
                    const imp = solveIdentifierValue(node.value);
                    if (imp.slice(-1) === "*") {
                        impStars.push(imp.slice(0, -2));
                    } else {
                        imps.push(imp);
                    }
                } else if (nodeType === NodeName.ClassNode) {
                    const cData = getClassData(node);
                    clzs[cData.name] = cData;
                } else if (nodeType === NodeName.InterfaceNode) {
                    const name = solveIdentifierValue(node.value);
                    ints[name] = node;
                }
            }
        }
    }
    if (node.children.length > 1) {
        console.error(`暂不支持package外部写代码，请检查[${file}]`);
    }
    return {
        name,
        path: p,
        pkg: pkg,
        fullName: `${pkg}.${name}`,
        node,
        file,
        imps,
        impStars,
        scope,
        ints,
        clzs
    }

}


function getImpls(node: AstNode, impDict: { [name: string]: ImpRefs }) {
    let impls = [] as string[];
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        impls.push(checkImp(solveIdentifierValue(child.value), impDict));
    }
    return impls;
}


export async function solveAst(dict: { [file: string]: AstNode }, callback: { (file: string, cnt: string) }, baseDir = "", filter: { (file: string): boolean } = _ => true) {
    const pkgDict = {} as { [pkg: string]: FileData[] };
    const pathDict = {} as { [path: string]: FileData };
    const fileDict = {} as { [file: string]: FileData };
    const uriDict = {} as { [uri: string]: FileData };
    const nameDict = {} as { [name: string]: FileData }
    for (const file in dict) {
        const fileData = getFile(file, dict[file], baseDir);
        const pkg = fileData.pkg;
        let list = pkgDict[pkg];
        if (!list) {
            pkgDict[pkg] = list = [];
        }
        list.push(fileData);
        const name = fileData.name;
        if (nameDict[name]) {
            console.error(`有同名文件，请自行处理：[${file}],[${nameDict[name].file}]`)
        }
        nameDict[name] = fileData;
        uriDict[fileData.fullName] = fileData;
        pathDict[fileData.path] = fileData;
        fileDict[file] = fileData;
    }

    const context = {
        pkgDict,
        pathDict,
        uriDict,
        nameDict
    }

    for (const file in dict) {
        if (filter(file)) {
            const dat = fileDict[file];
            await solveFileNode(dat, context).then(v => callback(file, v));
        }
    }
}


function getBlank(node: AstNode, plus = 0) {
    const level = node.level + plus;
    let v = "";
    for (let i = 0; i < level; i++) {
        v += "\t";
    }
    return v;
}

async function solveFileNode(data: FileData, cnt: FileContext) {
    const { clzs, ints, imps, impStars, pkg, file, name: fileName } = data;
    const content = await fs.promises.readFile(file, "utf-8");
    const { pkgDict, uriDict, nameDict } = cnt;

    //基于imps和impStars，创建引用计数器

    const impDict = {} as { [name: string]: ImpRefs };
    for (let i = 0; i < imps.length; i++) {
        const imp = imps[i];
        const idx = imp.lastIndexOf(".");
        const pkg = imp.slice(0, idx);
        const name = imp.slice(idx + 1);
        impDict[name] = { name, fullName: imp, count: 0, pkg }
    }
    const stars = impStars.concat(pkg, "");
    for (let i = 0; i < stars.length; i++) {
        const imPkg = stars[i];
        const list = pkgDict[imPkg];
        if (list) {
            for (let i = 0; i < list.length; i++) {
                const dat = list[i];
                const clzs = dat.clzs;
                const pkg = dat.pkg;
                for (let name in clzs) {
                    impDict[name] = { pkg, name, fullName: `${pkg}.${name}`, count: 0 };
                }
            }
        } else {
            console.error(`文件[${file}]中，无法找到指定包[${imPkg}]`)
        }
    }

    let v = "";

    for (let className in clzs) {
        v += solveClass(clzs[className]);
    }

    for (let interName in ints) {
        v += solveInterface(ints[interName]);
    }

    //将引用计数非 0 的 imp 放到文件头
    for (let name in impDict) {
        const impDat = impDict[name];
        if (name !== fileName && impDat.count > 0) {
            const fullName = impDat.fullName;
            const impFileDat = uriDict[fullName];
            if (impFileDat) {
                let rela = path.relative(path.dirname(data.path), impFileDat.path).replaceAll("\\", "/");
                if (!rela.startsWith(".")) {
                    rela = "./" + rela;
                }
                v = `import {${name}} from "${rela}"\n` + v;
            }
        }
    }

    return v;
    function getBaseDict(data: ClassData, dict: { [name: string]: true }, staticDict: { [name: string]: true }) {
        const baseClass = data.baseClass;
        if (baseClass) {
            let flag = false;
            const fileDat = nameDict[baseClass]

            if (fileDat) {
                const baseClassData = fileDat.clzs[baseClass];
                if (baseClassData) {
                    const baseDict = baseClassData.dict;
                    for (let na in baseDict) {
                        dict[na] = true;
                    }
                    const baseStaticDict = baseClassData.staticDict;
                    for (let na in baseStaticDict) {
                        staticDict[na] = true;
                    }
                    return getBaseDict(baseClassData, dict, staticDict);
                }
            }


            if (!flag && baseClass !== "Array") {
                console.error(`[${file}]无法找到基类[${baseClass}]`);
                debugger
            }
        }
    }


    function solveClass(classData: ClassData) {
        const { baseClass, dict, staticDict, others, constructors, name, setterDict, node } = classData;
        let baseClassStr = "";
        let baseDict = {} as { [name: string]: true };
        let baseStaticDict = {} as { [name: string]: true };
        if (baseClass && baseClass !== "Object") {
            baseClassStr = ` extends ${baseClass}`;
            getBaseDict(classData, baseDict, baseStaticDict);
        }
        const nodeChildren = node.children;

        let implIdx = getChildIdx(nodeChildren, 0, NodeName.KeywordNode, NodeID.KeywordImplementsID);
        let impls: string[];
        if (implIdx > -1) {
            let contNode = nodeChildren[++implIdx];
            if (contNode.type === NodeName.TransparentContainerNode) {
                impls = getImpls(contNode, impDict);
            }
        }

        let implStr = "";
        if (impls) {
            implStr = ` implements ${impls.join(",")} `
        }

        const lines = [] as string[];


        lines.push(`export class ${name}${baseClassStr}${implStr} {`);

        if (baseClass) {
            checkImp(baseClass, impDict);
        }
        const clzCnt = {
            name,
            lines,
            content,
            dict,
            staticDict,
            baseDict,
            impDict,
            baseStaticDict
        }
        for (let i = 0; i < constructors.length; i++) {
            const constuctor = constructors[i];
            lines.push(getFunctionStr(constuctor, clzCnt, false, true));
            lines.push("");
        }
        //检查 block 中`属性 / 方法`的引用，是否需要加 `this.`
        //先输出属性
        for (let key in staticDict) {
            const dat = staticDict[key];
            if (dat.type === NodeName.VariableNode) {
                lines.push(getVarStr(dat, clzCnt, true));
                lines.push("");
            }
        }

        for (let key in staticDict) {
            const dat = staticDict[key];
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
        for (let key in staticDict) {
            const dat = staticDict[key];
            if (dat.type === NodeName.FunctionNode) {
                lines.push(getFunctionStr(dat, clzCnt));
                lines.push("");
            }
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
        lines.push(`} `)
        return lines.join("\n");

    }

    function solveInterface(node: AstNode) {
        const children = node.children;
        const lines = [] as string[];
        let name = solveIdentifierValue(node.value);

        let extIdx = getChildIdx(children, 0, NodeName.KeywordNode, NodeID.KeywordExtendsID);
        let baseClassStr = "";
        if (extIdx > -1) {
            let contNode = children[++extIdx];
            if (contNode.type === NodeName.TransparentContainerNode) {
                let impls = getImpls(contNode, impDict);
                baseClassStr = ` extends ${impls.join(",")} `;
            }
        } else {
            extIdx = 0;
        }

        let scopeIdx = getChildIdx(children, extIdx, NodeName.ScopedBlockNode);
        let scope = children[scopeIdx];
        lines.push(`export interface ${name}${baseClassStr} {`);
        const cnt = {
            name,
            staticDict: {},
            baseStaticDict: {},
            content,
            dict: {},
            baseDict: {},
            impDict
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
        lines.push(`} `)
        return lines.join("\n");

    }
}



type ImpRefs = {
    name: string,
    /**
     * package全名
     */
    fullName: string,
    pkg: string,
    /**
     * 引用计数
     */
    count: number
};

interface ClassContext {
    name: string;
    dict: ClassDict;
    staticDict: ClassDict;
    baseStaticDict: { [name: string]: true };
    baseDict: { [name: string]: true };
    impDict: { [name: string]: ImpRefs }
    content: string;
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
    v += solveParam(paramNameNode, paramTypeNode, defaultNode, clzCnt, true);
    return v;
}

function solveParam(paramNameNode: AstNode, paramTypeNode: AstNode, defaultNode: AstNode, clzCnt: ClassContext, addOpt: boolean) {
    let typeStr = checkAddThis(paramTypeNode, clzCnt);
    let defStr = "";
    let optStr = "";
    if (defaultNode) {
        let val = getNodeStr(defaultNode, clzCnt);
        if (val === "null" || val === "undefined" || val === "void 0") {
            if (addOpt) {
                optStr = "?";
            }
        } else {
            defStr = ` = ${val}`;
        }
    }
    return `${solveIdentifierValue(paramNameNode.value)}${optStr}:${getTSType(typeStr)}${defStr}`;
}

function getNamespaceIdent(node: AstNode) {
    let v = solveIdentifierValue(node.value);
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
    return value.replaceAll("\n", "\\n");
}

function getRegExpStr(node: AstNode, clzCnt: ClassContext) {
    //输出的ast文本，会丢失  "g" "i" "m" 等正则标记，AS3正则表达式只有命名分组和js命名分组不一致，所以先直接输出
    let v = clzCnt.content.slice(node.start, node.end);
    //TODO 将as3的命名分组写法转化为js的命名分组写法
    return v;
}

function checkImp(v: string, impDict: { [name: string]: ImpRefs }) {
    let d = impDict[v];
    if (d) {
        d.count++;
    }
    return v;
}

function checkAddThis(node: AstNode, clzCnt: ClassContext) {
    let v = "";
    if (node.type === NodeName.IdentifierNode) {
        v = solveIdentifierValue(node.value);
        const { dict, staticDict, baseDict, impDict, baseStaticDict, name } = clzCnt;
        //检查node的parent
        let parent = node.parent;
        let isLocalVar = false;
        while (parent) {
            if (isScopeNode(parent)) {
                const dict = parent.dict;
                if (v in dict) {
                    isLocalVar = true;
                    break;
                }
            }
            parent = parent.parent;
        }
        if (!isLocalVar) {
            if (v in dict || v in baseDict) {//成员变量
                v = `this.${v}`;
            } else if (v in staticDict || v in baseStaticDict) {
                v = `${name}.${v}`;
            } else {
                isLocalVar = true;
            }
        }
        if (isLocalVar) {
            checkImp(v, impDict);
        }
    } else {
        v = getNodeStr(node, clzCnt);
    }
    return v;
}

function getLeftRightStr(node: AstNode, clzCnt: ClassContext, middle: string) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = checkAddThis(leftNode, clzCnt);
    let right = checkAddThis(rightNode, clzCnt);
    return `${left}${middle}${right}`;
}

function getDynamicAccessStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = checkAddThis(leftNode, clzCnt);
    let right = checkAddThis(rightNode, clzCnt);
    return `${left}[${right}]`;
}

function getTernaryStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [conNode, leftNode, rightNode] = children;
    let con = checkAddThis(conNode, clzCnt);
    let left = checkAddThis(leftNode, clzCnt);
    let right = checkAddThis(rightNode, clzCnt);
    return `${con} ? ${left} : ${right}`;
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
                lines.push(`${mainBlank}${prefix} (${checkAddThis(con, clzCnt)})`);
                lines.push(getNodeStr(cnt, clzCnt));
            } else {
                console.log(`条件节点没有2个子节点`, child);
            }
        }
    }
    return lines.join("\n");
}

function getMemberAccessExpressionNodeStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = checkAddThis(leftNode, clzCnt);
    let right = getNodeStr(rightNode, clzCnt);
    return `${left}.${right}`;
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
        case NodeName.VariableExpressionNode:
            return getVarStr(node.children[0], clzCnt);
        case NodeName.LiteralNode:
        case NodeName.NumericLiteralNode:
            return getLiteralStr(node, clzCnt);
        case NodeName.RegExpLiteralNode:
            return getRegExpStr(node, clzCnt);
        case NodeName.FunctionCallNode:
            return getFuncCallStr(node, clzCnt);
        case NodeName.ParameterNode:
            return getParamNodeString(node, clzCnt);
        case NodeName.ObjectLiteralValuePairNode:
            return getObjKVStr(node, clzCnt);
        case NodeName.LanguageIdentifierNode:
            return solveIdentifierValue(node.value);
        case NodeName.IdentifierNode://变量那些，最好不走这个，没法判断是否加`this`
            return solveIdentifierValue(node.value);
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
            throw Error(`不允许使用 @, [${node.root.file}]`);
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
        case NodeName.SwitchNode:
            return getSwitchStr(node, clzCnt);
    }
}

function getVarStr(node: AstNode, clzCnt: ClassContext, isClass?: boolean) {
    const children = node.children;
    let ident = "";
    let find = 0;
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
    let val = "";
    if (find > 0) {
        if (isConst) {
            val = "const ";
        } else {
            val = "var ";
        }
    }

    const nameNode = children[find];
    const typeNode = children[find + 1];
    const defaultNode = children[find + 2];

    let v = solveParam(nameNode, typeNode, defaultNode, clzCnt, false);
    if (isClass) {
        v = ident + getStaticString(isStatic) + v;
    } else {
        v = val + v;//使用 `var` 不用 `let`，`as3`的`var`作用域和`js`一致
    }
    return v;
}

function getChainVarStr(node: AstNode, clzCnt: ClassContext) {
    const [nameNode, typeNode, defaultNode] = node.children;
    return ", " + solveParam(nameNode, typeNode, defaultNode, clzCnt, false) + "\n";
}


/**
 * 处理返回节点
 * @param node 
 * @param clzCnt 
 * @returns 
 */
function getReturnStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let v = `${getBlank(node)} return `;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        v += checkAddThis(child, clzCnt);
    }
    return v;
}

function getForLoopStr(node: AstNode, clzCnt: ClassContext) {
    const [conditionNode, contentNode] = node.children;
    const id = node.id;
    if (id === NodeID.ForEachLoopID) {
        //for each(A in B) -> for(A of B)
        const nodeIn = conditionNode.children[0];
        return `for (${getLeftRightStr(nodeIn, clzCnt, " of ")})${getBlockStr(contentNode, clzCnt)} `;

    } else {//当 ForLoopID 处理 
        //检查是for(var a in b)还是 for(var i=0;i<n;i++);
        const conChildren = conditionNode.children;
        let conStr = "";
        const child0 = conChildren[0];
        if (conChildren.length === 1 && child0.type === NodeName.BinaryOperatorInNode) {
            conStr = `${getNodeStr(child0, clzCnt)}`
        } else {
            conStr = getConStr(conditionNode, clzCnt, ";");
        }
        return `for(${conStr})${getBlockStr(contentNode, clzCnt)} `

    }
}

function getWhileLoopStr(node: AstNode, clzCnt: ClassContext) {
    const [conditionNode, contentNode] = node.children;
    return `while(${getNodeStr(conditionNode, clzCnt)})${getBlockStr(contentNode, clzCnt)} `
}

function getDoWhileLoopStr(node: AstNode, clzCnt: ClassContext) {
    const [contentNode, conditionNode] = node.children;
    return `do${getBlockStr(contentNode, clzCnt)}while(${getNodeStr(conditionNode, clzCnt)}) `
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
                name = solveIdentifierValue(child.value);
            } else {
                retType = getTSType(checkAddThis(child, clzCnt));
            }
        } else if (type === NodeName.ContainerNode) {//处理参数
            let subs = child.children;
            for (let i = 0; i < subs.length; i++) {
                params.push(getParamNodeString(subs[i], clzCnt));
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.LanguageIdentifierNode) {
            retType = getTSType(solveIdentifierValue(child.value));
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
    let v = isConstructor ? `constructor(${paramsStr})` : `${getBlank(node)}${ident}${override}${getStaticString(isStatic)}${funcStr}${name} (${paramsStr})${retType} `;
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
                name = solveIdentifierValue(child.value);
            } else {
                retType = getTSType(checkAddThis(child, clzCnt));
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.ContainerNode) {
            let sub = child.children[0];
            if (sub.type === NodeName.ParameterNode) {
                paramString = getParamNodeString(node, clzCnt);
            }
        } else if (type === NodeName.LanguageIdentifierNode) {
            retType = getTSType(solveIdentifierValue(child.value));
        }
    }
    if (retType) {
        retType = ":" + retType;
    }
    let v = `${getBlank(node)}${ident}${getStaticString(isStatic)}set ${name} (${paramString})${retType} `;
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
                name = solveIdentifierValue(child.value);
            } else {
                retType = getTSType(solveIdentifierValue(child.value));
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.LanguageIdentifierNode) {
            retType = getTSType(solveIdentifierValue(child.value));
        }
    }
    if (retType) {
        retType = ":" + retType;
    }
    let v = `${getBlank(node)}${ident}${getStaticString(isStatic)}get ${name} ()${retType} `;
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
        v = `{${lines.join(", ")} } `;
    }
    return v;
}
function getObjKVStr(node: AstNode, clzCnt: ClassContext) {
    const [keyNode, valueNode] = node.children;
    return `${solveIdentifierValue(keyNode.value)} : ${checkAddThis(valueNode, clzCnt)} `
}

function getArrStr(node: AstNode, clzCnt: ClassContext) {
    const container = node.children[0];
    let v = "";
    if (container) {
        const lines = [] as string[];
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            lines.push(checkAddThis(child, clzCnt));
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
            type = getTSType(solveIdentifierValue(typeNode.value));
        } else {
            type = getNodeStr(typeNode, clzCnt);
        }
    }
    return `Array < ${type}> `;
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
        v = `Array < ${getTSType(solveIdentifierValue(idNode.value))}> (${lines.join(", ")})`;
    }
    return v;
}

function getBlockStr(node: AstNode, clzCnt: ClassContext) {
    let isSynthesized = node.value === "SYNTHESIZED";

    let lines = [] as string[];
    if (!isSynthesized) {
        lines.push("{");
    }
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        lines.push(getNodeStr(child, clzCnt));
    }
    if (!isSynthesized) {
        lines.push("}");
    }
    return lines.join("\n");
}

function getConStr(node: AstNode, clzCnt: ClassContext, spe = "") {
    const children = node.children;
    let childs = [] as string[];
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeName.ContainerNode) {
            childs.push(getConStr(child, clzCnt, ","));
        } else {
            childs.push(checkAddThis(child, clzCnt));
        }
    }
    let pre = "";
    let suf = "";
    if (node.value !== "SYNTHESIZED") {
        pre = "(";
        suf = ")";
    }
    return `${pre}${childs.join(spe)}${suf}`
}


function getFuncCallStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let v = "";
    if (node.value === `"__JS__"`) {// laya的 JS直接输出的方法
        const strNode = children[1].children[0];
        v = solveIdentifierValue(strNode.value);
    } else {
        let i = 0;
        let child = children[i];
        if (child.type === NodeName.KeywordNode) {// new
            v = "new ";
            i++;
        }
        let nameNode = children[i++];
        v += checkAddThis(nameNode, clzCnt);
        v += `(${getConStr(children[i], clzCnt, ",")})`;
    }
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
    const paramNameNode = argNode.children[0];
    return `catch (${solveIdentifierValue(paramNameNode.value)})${getBlockStr(cntNode, clzCnt)} `;
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
        v += " " + solveIdentifierValue(label.value)
    }
    v += ";\n"
    return v;
}

function getLabelStr(node: AstNode, clzCnt: ClassContext) {
    const [idNode, statementNode] = node.children;
    let v = solveIdentifierValue(idNode.value);
    v += getNodeStr(statementNode, clzCnt);
    return v;
}

function getUnaryRightStr(node: AstNode, clzCnt: ClassContext, right: string) {
    const child = node.children[0];
    let v = getNodeStr(child, clzCnt);
    return `${v}${right} `;
}

function getUnaryLeftStr(node: AstNode, clzCnt: ClassContext, left: string) {
    const child = node.children[0];
    let v = getNodeStr(child, clzCnt);
    return `${left}${v} `;
}

function getSwitchStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [condNode, cntNode] = children;
    let v = `switch (${checkAddThis(condNode, clzCnt)
        }) {
\n`;
    const cases = cntNode.children;
    for (let i = 0; i < cases.length; i++) {
        const caseNode = cases[i];
        const caseChildren = caseNode.children;
        let cnt: AstNode;
        if (caseNode.type !== NodeName.TerminalNode) {
            v += `\tcase ${checkAddThis(caseChildren[0], clzCnt)}: \n`;
            cnt = caseChildren[1];
        } else {
            v += `default: \n`;
            cnt = caseChildren[0];
        }
        v += getNodeStr(cnt, clzCnt) + "\n";
    }
    v += "}";
    return v;
}