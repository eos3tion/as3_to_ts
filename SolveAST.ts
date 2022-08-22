import fs from "fs";
import path from "path";
import { ClassData, getClassData, isScopeNode } from "./GetScopeData";
import { getChildIdx, solveIdentifierValue } from "./Helper";
import { importFilter } from "./LayaIFFlasth";

type FileContext = {
    pkgDict: { [pkg: string]: FileData[] },
    pathDict: { [path: string]: FileData }
    uriDict: { [uri: string]: FileData }
    nameDict: { [name: string]: FileData }
}

type FileData = ReturnType<typeof getFile>;

interface PackageScope {
    clzs: { [name: string]: ClassData };
    ints: { [name: string]: AstNode };
    other: AstNode[];
}

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
    const nodeChildren = node.children;
    //解析import节点
    const packageNode = nodeChildren[0];

    const inPackage = {
        clzs: {} as { [name: string]: ClassData },
        ints: {} as { [name: string]: AstNode },
        other: [] as AstNode[]
    } as PackageScope;
    let scope: AstNode;
    if (packageNode) {
        scope = packageNode.children[1];
        pkg = solveIdentifierValue(packageNode.value);

        if (scope) {
            const children = scope.children;
            for (let i = 0; i < children.length; i++) {
                //检查
                const node = children[i];
                checkChild(node, inPackage);
            }
        }
    }
    const outPackage = {
        clzs: {} as { [name: string]: ClassData },
        ints: {} as { [name: string]: AstNode },
        other: [] as AstNode[]
    } as PackageScope;
    for (let i = 1; i < nodeChildren.length; i++) {
        const node = nodeChildren[i];
        checkChild(node, outPackage);
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
        inPackage,
        outPackage
    }
    function checkChild(node: AstNode, { clzs, ints, other }: PackageScope) {
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
        } else {
            other.push(node);
        }
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
        if (importFilter(path.relative(baseDir, file))) {
            continue
        }
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
            try {
                await solveFileNode(dat, context).then(v => callback(file, v));
            } catch (e) {
                console.log(`处理[${file}]出错：\n`, e)
            }
        }
    }
}



async function solveFileNode(data: FileData, cnt: FileContext) {
    const { imps, impStars, pkg, file, name: fileName, inPackage, outPackage } = data;
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
                const { clzs, ints } = dat.inPackage;
                const pkg = dat.pkg;
                for (let name in clzs) {
                    impDict[name] = { pkg, name, fullName: `${pkg}.${name}`, count: 0 };
                }
                for (let name in ints) {
                    impDict[name] = { pkg, name, fullName: `${pkg}.${name}`, count: 0 };
                }
            }
        } else {
            console.error(`文件[${file}]中，无法找到指定包[${imPkg}]`)
        }
    }

    let v = "";

    const otherCnt = {
        name: "",
        staticDict: {},
        baseStaticDict: {},
        content,
        dict: {},
        baseDict: {},
        impDict
    };
    v = solvePackageScope(v, inPackage, true);
    v = solvePackageScope(v, outPackage, false);




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
                //laya路径特殊处理
                //laya的as3项目目录结构为`libs/laya/src/`，而ts项目为`libs`
                rela = rela.replace("laya/src/", "");

                v = `import {${name}} from "${rela}"\n` + v;
            }
        }
    }




    return v;
    function solvePackageScope(v: string, scope: PackageScope, exp: boolean) {

        const { clzs, ints, other } = scope;
        for (let className in clzs) {
            v += solveClass(clzs[className], exp) + "\n";
        }

        for (let interName in ints) {
            v += solveInterface(ints[interName], exp) + "\n";
        }


        for (let i = 0; i < other.length; i++) {
            const node = other[i];
            v += getNodeStr(node, otherCnt) + "\n";
        }
        return v;
    }
    function getBaseDict(data: ClassData, dict: { [name: string]: true }, staticDict: { [name: string]: true }) {
        const baseClass = data.baseClass;
        if (baseClass) {
            let flag = false;
            const fileDat = nameDict[baseClass]

            if (fileDat) {
                const baseClassData = fileDat.inPackage.clzs[baseClass];
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


    function solveClass(classData: ClassData, exp: boolean) {
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
        let expStr = "";
        if (exp) {
            expStr = "export "
        }
        lines.push(`${expStr}class ${name}${baseClassStr}${implStr} {`);

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
            lines.push(getFunctionStr(constuctor, clzCnt, true, true, baseClassStr !== ""));
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
                lines.push(getFunctionStr(dat, clzCnt, true));
                lines.push("");
            }
        }
        //最后附加函数
        for (let key in dict) {
            const dat = dict[key];
            if (dat.type === NodeName.FunctionNode) {
                lines.push(getFunctionStr(dat, clzCnt, true));
                lines.push("");
            }
        }
        lines.push(`} `)
        for (let i = 0; i < others.length; i++) {
            const other = others[i];
            lines.push(getNodeStr(other, clzCnt));
            lines.push("");
        }
        return lines.join("\n");

    }

    function solveInterface(node: AstNode, exp: boolean) {
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
        let expStr = "";
        if (exp) {
            expStr = "export "
        }
        lines.push(`${expStr}interface ${name}${baseClassStr} {`);
        const cnt = {
            name,
            staticDict: {},
            baseStaticDict: {},
            content,
            dict: {},
            baseDict: {},
            impDict,
            isInterface: true,
        };
        if (scope) {
            const children = scope.children;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                switch (child.type) {
                    case NodeName.FunctionNode:
                        lines.push(getFunctionStr(child, cnt, true));
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
    isInterface?: boolean;
}



const as2tsType = {
    "Number": "number",
    "int": "number",
    "uint": "number",
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
    let typeStr = checkScope(paramTypeNode, clzCnt, true);
    let defStr = "";
    let optStr = "";
    if (defaultNode && !clzCnt.isInterface) {
        let val = checkScope(defaultNode, clzCnt);
        if (val) {
            if (val === "null" || val === "undefined" || val === "void 0") {
                if (addOpt) {
                    optStr = "?";
                }
            } else {
                defStr = ` = ${val}`;
            }
        }
    }
    if (typeStr) {
        typeStr = `: ${getTSType(typeStr)}`;
    }
    return `${solveIdentifierValue(paramNameNode.value)}${optStr}${typeStr}${defStr}`;
}

function getNamespaceIdent(node: AstNode) {
    let v = solveIdentifierValue(node.value);
    if (v === "public" || v === "internal") {
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
    if (node.id === NodeID.LiteralStringID) {
        let v = solveIdentifierValue(node.value)
            .replaceAll("\r", "\\r")
            .replaceAll("\n", "\\n")
            .replaceAll("\\", "\\\\")
            .replaceAll("\"", "\\\"")
            .replaceAll("\'", "\\\'")
        return `"${v}"`;
    } else {
        let [, value] = node.value as string;
        return value;
    }
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

function checkScope(node: AstNode, clzCnt: ClassContext, noAddThis?: boolean) {
    let v = "";
    if (node.type === NodeName.IdentifierNode) {
        v = solveIdentifierValue(node.value);
        const { dict, staticDict, baseDict, impDict, baseStaticDict, name } = clzCnt;
        //检查node的parent
        let parent = node.parent;
        while (parent) {
            if (isScopeNode(parent)) {
                const dict = parent.dict;
                if (v in dict) {
                    noAddThis = true;
                    break;
                }
            }
            parent = parent.parent;
        }
        if (!noAddThis) {
            if (v in dict || v in baseDict) {//成员变量
                v = `this.${v}`;
            } else if (v in staticDict || v in baseStaticDict) {
                v = `${name}.${v}`;
            } else {
                noAddThis = true;
            }
        }
        if (noAddThis) {
            checkImp(v, impDict);
        }
    } else {
        v = getNodeStr(node, clzCnt);
    }
    return v;
}

function getLeftRightStr(node: AstNode, clzCnt: ClassContext, middle: string, addBrakets?: boolean) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = checkScope(leftNode, clzCnt);
    let right = checkScope(rightNode, clzCnt);
    let v = `${left}${middle}${right}`;
    if (addBrakets) {
        v = `(${v})`;
    }
    return v;
}

function getDynamicAccessStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = checkScope(leftNode, clzCnt);
    let right = checkScope(rightNode, clzCnt);
    return `${left}[${right}]`;
}

function getTernaryStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [conNode, leftNode, rightNode] = children;
    let con = checkScope(conNode, clzCnt);
    let left = checkScope(leftNode, clzCnt);
    let right = checkScope(rightNode, clzCnt);
    return `${con} ? ${left} : ${right}`;
}


function getIfNodeStr(node: AstNode, clzCnt: ClassContext) {
    let lines = [] as string[];
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeName.ConditionalNode) {//children只能是ConditionNode
            const subs = child.children;
            //只会有 0-2 个子节点
            //最多一个 conditionalNode 和一个 contentsNode
            if (subs.length === 2) {
                let [con, cnt] = subs;
                let prefix = i === 0 ? "if" : "else if";
                lines.push(`${prefix} (${checkScope(con, clzCnt)})`);
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
    let left = checkScope(leftNode, clzCnt);
    let right = getNodeStr(rightNode, clzCnt);
    return `${left}.${right}`;
}

function getNodeStr(node: AstNode, clzCnt: ClassContext): string {
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
            return getLiteralStr(node, clzCnt);
        case NodeName.NumericLiteralNode:
            return `(${getLiteralStr(node, clzCnt)})`;
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
        case NodeName.TypedExpressionNode:
            return getTypedExpressStr(node, clzCnt);
        case NodeName.DynamicAccessNode:
            return getDynamicAccessStr(node, clzCnt);
        case NodeName.FunctionObjectNode:
            return getFunctionStr(node.children[0], clzCnt);
        case NodeName.FunctionNode:
            return getFunctionStr(node, clzCnt);
        //========== BinaryOperator ==================================
        case NodeName.BinaryOperatorCommaNode:
            return getLeftRightStr(node, clzCnt, ", ");
        case NodeName.BinaryOperatorAsNode:
            return getAsStr(node, clzCnt);
        case NodeName.BinaryOperatorInNode:
            return getLeftRightStr(node, clzCnt, " in ");
        case NodeName.BinaryOperatorInstanceOfNode:
        case NodeName.BinaryOperatorIsNode:
            return getInstanceOfStr(node, clzCnt);
        case NodeName.BinaryOperatorAssignmentNode:
            return getLeftRightStr(node, clzCnt, " = ", true);
        //============ BinaryOperatorMath =================
        case NodeName.BinaryOperatorPlusNode:
            return getLeftRightStr(node, clzCnt, " + ", true);
        case NodeName.BinaryOperatorPlusAssignmentNode:
            return getLeftRightStr(node, clzCnt, " += ", true);
        case NodeName.BinaryOperatorMinusNode:
            return getLeftRightStr(node, clzCnt, " - ", true);
        case NodeName.BinaryOperatorMinusAssignmentNode:
            return getLeftRightStr(node, clzCnt, " -= ", true);
        case NodeName.BinaryOperatorMultiplicationNode:
            return getLeftRightStr(node, clzCnt, " * ", true);
        case NodeName.BinaryOperatorMultiplicationAssignmentNode:
            return getLeftRightStr(node, clzCnt, " *= ", true);
        case NodeName.BinaryOperatorDivisionNode:
            return getLeftRightStr(node, clzCnt, " / ", true);
        case NodeName.BinaryOperatorDivisionAssignmentNode:
            return getLeftRightStr(node, clzCnt, " /= ", true);
        case NodeName.BinaryOperatorModuloNode:
            return getLeftRightStr(node, clzCnt, " % ", true);
        case NodeName.BinaryOperatorModuloAssignmentNode:
            return getLeftRightStr(node, clzCnt, " %= ", true);
        //============ BinaryOperatorBitwise =================
        case NodeName.BinaryOperatorBitwiseAndNode:
            return getLeftRightStr(node, clzCnt, " & ", true);
        case NodeName.BinaryOperatorBitwiseAndAssignmentNode:
            return getLeftRightStr(node, clzCnt, " &= ", true);
        case NodeName.BinaryOperatorBitwiseLeftShiftNode:
            return getLeftRightStr(node, clzCnt, " << ", true);
        case NodeName.BinaryOperatorBitwiseLeftShiftAssignmentNode:
            return getLeftRightStr(node, clzCnt, " <<= ", true);
        case NodeName.BinaryOperatorBitwiseOrNode:
            return getLeftRightStr(node, clzCnt, " | ", true);
        case NodeName.BinaryOperatorBitwiseOrAssignmentNode:
            return getLeftRightStr(node, clzCnt, " |= ", true);
        case NodeName.BinaryOperatorBitwiseRightShiftNode:
            return getLeftRightStr(node, clzCnt, " >> ", true);
        case NodeName.BinaryOperatorBitwiseRightShiftAssignmentNode:
            return getLeftRightStr(node, clzCnt, " >>= ", true);
        case NodeName.BinaryOperatorBitwiseUnsignedRightShiftNode:
            return getLeftRightStr(node, clzCnt, " >>> ", true);
        case NodeName.BinaryOperatorBitwiseUnsignedRightShiftAssignmentNode:
            return getLeftRightStr(node, clzCnt, " >>>= ", true);
        case NodeName.BinaryOperatorBitwiseXorNode:
            return getLeftRightStr(node, clzCnt, " ^ ", true);
        case NodeName.BinaryOperatorBitwiseXorAssignmentNode:
            return getLeftRightStr(node, clzCnt, " ^= ", true);
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
            return getLeftRightStr(node, clzCnt, " &&= ", true);
        case NodeName.BinaryOperatorLogicalOrNode:
            return getLeftRightStr(node, clzCnt, " || ", true);
        case NodeName.BinaryOperatorLogicalOrAssignmentNode:
            return getLeftRightStr(node, clzCnt, " ||= ", true);
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
        case NodeName.ThrowNode:
            return getThrowStr(node, clzCnt);
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
        default:
            console.log(`未处理的类型：[${node.type}]`)
            return "";
    }
}

function getVarStr(node: AstNode, clzCnt: ClassContext, isClass?: boolean) {
    const children = node.children;
    let ident = "";
    let find = 0;
    let isConst = false;
    let isStatic = false;
    let chains = [] as AstNode[];
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
            if (!find) {
                find = i + 1;
            }
        } else if (type === NodeName.ChainedVariableNode) {
            chains.push(child);
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
    let defaultNode = children[find + 2];
    if (defaultNode && defaultNode.type === NodeName.ChainedVariableNode) {
        defaultNode = undefined;
    }
    let v = solveParam(nameNode, typeNode, defaultNode, clzCnt, false);
    if (isClass) {
        v = ident + getStaticString(isStatic) + v;
    } else {
        v = val + v;//使用 `var` 不用 `let`，`as3`的`var`作用域和`js`一致
    }
    if (chains.length > 0) {
        for (let i = 0; i < chains.length; i++) {
            const child = chains[i];
            v += getChainVarStr(child, clzCnt);
        }
    }
    return v;
}

function getChainVarStr(node: AstNode, clzCnt: ClassContext) {
    const [nameNode, typeNode, defaultNode] = node.children;
    return ", " + solveParam(nameNode, typeNode, defaultNode, clzCnt, false);
}


/**
 * 处理返回节点
 * @param node 
 * @param clzCnt 
 * @returns 
 */
function getReturnStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let v = `return `;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        v += checkScope(child, clzCnt);
    }
    return v;
}

function getForLoopStr(node: AstNode, clzCnt: ClassContext) {
    const [conditionNode, contentNode] = node.children;
    const id = node.id;
    if (id === NodeID.ForEachLoopID) {
        //for each(A in B) -> for(A of B)
        const nodeIn = conditionNode.children[0];
        return `for (${sovleInLoop(nodeIn, "of", clzCnt)})${getBlockStr(contentNode, clzCnt)} `;

    } else {//当 ForLoopID 处理 
        //检查是for(var a in b)还是 for(var i=0;i<n;i++);
        const conChildren = conditionNode.children;
        let conStr = "";
        const child0 = conChildren[0];
        if (conChildren.length === 1 && child0.type === NodeName.BinaryOperatorInNode) {
            conStr = sovleInLoop(child0, "in", clzCnt);
        } else {
            conStr = getConStr(conditionNode, clzCnt, ";");
        }
        return `for(${conStr})${getBlockStr(contentNode, clzCnt)} `
    }

    function sovleInLoop(nodeIn: AstNode, middle: string, clzCnt: ClassContext) {
        const [varExpNode, listNode] = nodeIn.children;
        let varStr = "";
        let nameNode: AstNode;
        if (varExpNode.type === NodeName.VariableExpressionNode) {
            const varChildren = varExpNode.children[0].children;
            const first = varChildren[0];
            nameNode = first;
            if (first.type === NodeName.KeywordNode) {
                varStr = "var "
                nameNode = varChildren[1];
            }
        } else {
            nameNode = varExpNode;
        }
        const name = solveIdentifierValue(nameNode.value);
        return `${varStr}${name} ${middle} ${checkScope(listNode, clzCnt)}`
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

function getFunctionStr(node: AstNode, clzCnt: ClassContext, noFunc?: boolean, isConstructor?: boolean, addSuper?: boolean) {
    const children = node.children;
    let ident = "";
    let name: string;
    let retNode: AstNode;
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
                retNode = child;
            }
        } else if (type === NodeName.ContainerNode) {//处理参数
            let subs = child.children;
            for (let i = 0; i < subs.length; i++) {
                params.push(getParamNodeString(subs[i], clzCnt));
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.LanguageIdentifierNode) {
            retNode = child;
        }
    }

    let override = "";
    if (isOverride) {
        override = "override ";
    }
    let paramsStr = params.join(",");
    let funcStr = "";
    if (!noFunc) {
        funcStr = "function "
    }

    let blockStr = "";
    if (block) {
        blockStr = getBlockStr(block, clzCnt, isConstructor && addSuper);
    }
    if (blockStr) {
        retNode = undefined;
    }

    let retType = "";
    if (retNode) {
        retType = ": " + getTSType(checkScope(retNode, clzCnt));
    }
    let v = isConstructor ? `constructor(${paramsStr})` : `${ident}${override}${getStaticString(isStatic)}${funcStr}${name} (${paramsStr})`;
    return v + retType + blockStr;
}



function getSetterStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    let ident = "";
    let isStatic = false;
    let name = "";
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
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.ContainerNode) {
            let sub = child.children[0];
            if (sub.type === NodeName.ParameterNode) {
                paramString = getParamNodeString(sub, clzCnt);
            }
        }
    }

    let v = `${ident}${getStaticString(isStatic)}set ${name} (${paramString}) `;
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
    let retNode: AstNode;
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
                retNode = child;
            }
        } else if (type === NodeName.ScopedBlockNode) {
            block = child;
        } else if (type === NodeName.LanguageIdentifierNode) {
            retNode = child;
        }
    }

    let blockStr = "";
    if (block) {
        blockStr = getBlockStr(block, clzCnt);
    }
    if (blockStr) {
        retNode = undefined;
    }

    let retType = "";
    if (retNode) {
        retType = ": " + getTSType(checkScope(retNode, clzCnt));
    }
    return `${ident}${getStaticString(isStatic)}get ${name} ()${retType}${blockStr}`;
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
    return `"${solveIdentifierValue(keyNode.value)}" : ${checkScope(valueNode, clzCnt)} `
}

function getArrStr(node: AstNode, clzCnt: ClassContext) {
    const container = node.children[0];
    let v = "";
    if (container) {
        const lines = [] as string[];
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            lines.push(checkScope(child, clzCnt));
        }
        v = `[${lines.join(", ")}]`;
    }
    return v;
}

function getTypedExpressStr(node: AstNode, clzCnt: ClassContext) {
    const [_, typeNode] = node.children;
    return `Array<${getArrayType(typeNode, clzCnt)}>`;
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
        let type = getArrayType(idNode, clzCnt);
        v = `Array<${type}>(${lines.join(", ")})`;
    }
    return v;
}

function getArrayType(node: AstNode, clzCnt: ClassContext) {
    let type = "any";
    if (node) {
        if (node.type === NodeName.IdentifierNode) {
            type = getTSType(solveIdentifierValue(node.value));
            checkImp(type, clzCnt.impDict);
        } else {
            type = getNodeStr(node, clzCnt);
        }
    }
    return type;
}

function getBlockStr(node: AstNode, clzCnt: ClassContext, addSuper?: boolean) {
    let isSynthesized = node.value === "SYNTHESIZED";

    let lines = [] as string[];
    if (!isSynthesized) {
        lines.push("{");
    }
    const children = node.children;
    let hasAddSuper = false;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        let v = getNodeStr(child, clzCnt);
        if (addSuper) {
            if (v.indexOf("super(") > -1) {
                hasAddSuper = true;
            }
        }
        lines.push(getNodeStr(child, clzCnt) + ";");
    }

    if (!isSynthesized) {
        lines.push("}");
    }
    if (addSuper && !hasAddSuper) {
        lines.splice(1, 0, "super();");
    }
    //检查是否需要附加`super()`
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
            childs.push(checkScope(child, clzCnt));
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
        let isNew = false;
        if (child.type === NodeName.KeywordNode) {// new
            v = "new ";
            isNew = true;
            i++;
        }
        const nameNode = children[i++];
        const conNode = children[i++];
        let name = checkScope(nameNode, clzCnt);
        if (name === "trace") {
            name = "console.log";
        }
        //检查 name 是否有同引用值
        const conChildren = conNode.children;
        let imp = clzCnt.impDict[name];
        let isAs = false;
        if (!isNew) {
            if (imp) {//有引用至
                //检查参数节点是否为单一node
                if (conChildren.length === 1) {//此方法为as3的装箱操作，js没有，处理为  as 
                    const sub = conChildren[0];
                    v = getAs(checkScope(sub, clzCnt), name);
                    isAs = true;

                }
            }
        }
        if (!isAs) {
            v += name;

            if (isNew && nameNode.type === NodeName.TypedExpressionNode && conChildren.length > 1) {//as3 new Vector只有2个参数，第一个是长度，第二个为是否是固定长度的参数
                const lenNode = conChildren[0];
                v += `(${checkScope(lenNode, clzCnt)})`
            } else {
                v += `(${getConStr(conNode, clzCnt, ",")})`;
            }
        }
    }
    return v;
}

function getTryStr(node: AstNode, clzCnt: ClassContext) {
    let v = "try";
    let children = node.children;
    let hasCatch = false;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        v += getNodeStr(child, clzCnt);
        if (child.type === NodeName.CatchNode) {
            hasCatch = true;
        }
    }
    if (!hasCatch) {
        v += `catch{\n}`
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
    let v = checkScope(child, clzCnt);
    return `${v}${right} `;
}

function getUnaryLeftStr(node: AstNode, clzCnt: ClassContext, left: string) {
    const child = node.children[0];
    let v = checkScope(child, clzCnt);
    return `${left}${v} `;
}

function getSwitchStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [condNode, cntNode] = children;
    let v = `switch (${checkScope(condNode, clzCnt)
        }) {
\n`;
    const cases = cntNode.children;
    for (let i = 0; i < cases.length; i++) {
        const caseNode = cases[i];
        const caseChildren = caseNode.children;
        let cnt: AstNode;
        if (caseNode.type !== NodeName.TerminalNode) {
            v += `\tcase ${checkScope(caseChildren[0], clzCnt)}: \n`;
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

const typeofValue = {
    "Number": "number",
    "int": "number",
    "uint": "number",
    "Object": "object",
    "String": "string",
    "Boolean": "boolean",
} as { [key: string]: string }
function getInstanceOfStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let v = "";
    let flag = true;
    if (rightNode.type === NodeName.IdentifierNode) {
        //检查是否为基本类型
        let t = typeofValue[solveIdentifierValue(rightNode.value)]
        if (t) {
            v = `typeof ${checkScope(leftNode, clzCnt)} === "${t}"`;
            flag = false;
        }
    }

    if (flag) {
        v = getLeftRightStr(node, clzCnt, " instanceof ");
    }
    return v;
}

function getThrowStr(node: AstNode, clzCnt: ClassContext) {
    return "throw " + checkScope(node.children[0], clzCnt);
}

function getAsStr(node: AstNode, clzCnt: ClassContext) {
    const children = node.children;
    const [leftNode, rightNode] = children;
    let left = checkScope(leftNode, clzCnt);
    let right = checkScope(rightNode, clzCnt);
    return `(${getAs(left, right)})`
}

function getAs(left: string, right: string) {
    right = getTSType(right)
    if (right === "Array") {
        right = "any[]";
    } else if (right === "Object") {
        right = "any";
    }
    return `${left} as ${right}`
}
