import path from "path";
import { getChildIdx, getNamespaceIdent, solveIdentifierValue } from "../Helper";
import { ClassData } from "./ClassScope";
import { InterfaceScope } from "./InterfaceScope";
import { Scope } from "./Scope";

class FileScope extends Scope<Node> implements Node {
    readonly node: AstNode;
    type = FileScopeType.File;
    /**
     * 所有子集
     */
    subs = {} as { [name: string]: Node };
    enums: EnumData[];
    /**
     * 可被导出的函数集
     */
    funcs: StaticFuncNode[];
    /**
     * class集合
     */
    clzs: ClassData[];
    /**
     * interface集合
     */
    ints: InterfaceScope[];
    /**
     * 得到文件路径
     */
    readonly file: string;
    readonly name: string;
    /**
     * ```
     * import xx.xx.xxx;  
     * ```
     * 不带`*`的import
     */
    imps = [] as string[];
    /**
     * ```
     * import xx.xx.xxx.*;  
     * ```
     * 这种带`*`的import
     */
    impStars = [] as string[];

    /**
     * 包名字
     */
    pkg: string;


    constructor(node: AstNode, file: string) {
        super();
        this.node = node;
        this.file = file;
        let p = file.slice(0, -3);
        this.name = path.basename(p);

        //检查包体中的
        check(node, this);
    }

}


function check(node: AstNode, file: FileScope) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeType.PackageNode) {
            checkPackage(child, file)
        } else {
            checkChild(child, file, true);
        }
    }
}

function checkPackage(node: AstNode, file: FileScope) {
    let scope = node.children[1];
    let pkg = solveIdentifierValue(node.value);
    file.pkg = pkg;
    if (scope) {
        const children = scope.children;
        for (let i = 0; i < children.length; i++) {
            //检查
            const node = children[i];
            checkChild(node, file);
        }
    }
}

function checkChild(node: AstNode, file: FileScope, isPrivate?: boolean) {
    const nodeType = node.type;
    if (nodeType === NodeType.ImportNode) {
        const imp = solveIdentifierValue(node.value);
        if (imp.slice(-1) === "*") {
            file.impStars.push(imp.slice(0, -2));
        } else {
            file.imps.push(imp);
        }
    } else if (nodeType === NodeType.ClassNode) {

    } else if (nodeType === NodeType.InterfaceNode) {

    } else {

    }
}

function checkClass(node: AstNode) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];

    }
}

function checkFunctionNode(node: FunctionAstNode, className?: string) {
    const children = node.children;
    let namespaceIdx = getChildIdx(children, 0, NodeType.NamespaceIdentifierNode);
    let namespaceNode: AstNode;
    if (namespaceIdx !== -1) {
        namespaceNode = children[namespaceIdx];
    }
    let namespace = getNamespaceIdent(namespaceNode);

    let isStatic = false;
    let isOverride = false;

    let modConIdx = getChildIdx(children, namespaceIdx, NodeType.ModifiersContainerNode);
    let modConNode = children[modConIdx];
    if (modConNode) {
        const children = modConNode.children;
        isStatic = getChildIdx(children, 0, NodeType.ModifierNode, NodeID.StaticID) > -1;
        isOverride = getChildIdx(children, 0, NodeType.ModifierNode, NodeID.OverrideID) > -1;
    }

    let nameIdx = getChildIdx(children, modConIdx, NodeType.IdentifierNode);
    let nameNode = children[nameIdx];
    let name = "";
    if (nameNode) {
        name = solveIdentifierValue(nameNode.value);
    }
    let isConstructor = name === className;
    if (isConstructor) {
        name = "";
    }

    let paramsConIdx = getChildIdx(children, nameIdx, NodeType.ContainerNode);
    let paramsCon = children[paramsConIdx];

    let retIdx = getChildIdx(children, nameIdx, NodeType.LanguageIdentifierNode);
    if (retIdx === -1) {
        retIdx = getChildIdx(children, nameIdx, NodeType.IdentifierNode);
    }
    let typeNode = children[retIdx];


    let scopeIdx = getChildIdx(children, nameIdx, NodeType.ScopedBlockNode);
    let scope = children[scopeIdx];

    node.name = name;
    node.namespace = namespace;
    node.isStatic = isStatic;
    node.typeNode = typeNode;

    node.isConstructor = isConstructor;
    node.isOverride = isOverride;
    node.scope = scope;
    node.paramsCon = paramsCon;
}

function checkVarNode(node: VariableNode) {
    const children = node.children;

    let namespaceIdx = getChildIdx(children, 0, NodeType.NamespaceIdentifierNode);
    let namespaceNode: AstNode;
    if (namespaceIdx !== -1) {
        namespaceNode = children[namespaceIdx];
    }
    let namespace = getNamespaceIdent(namespaceNode);

    let isStatic = false;

    let modConIdx = getChildIdx(children, namespaceIdx, NodeType.ModifiersContainerNode);
    let modConNode = children[modConIdx];
    if (modConNode) {
        const children = modConNode.children;
        isStatic = getChildIdx(children, 0, NodeType.ModifierNode, NodeID.StaticID) > -1;
    }

    let isConst = false;
    let keyIdx = getChildIdx(children, namespaceIdx, NodeType.KeywordNode);
    let keyNode = children[keyIdx];
    isConst = keyNode.id === NodeID.KeywordConstID;


    let nameNode = children[keyIdx + 1];
    let name = solveIdentifierValue(nameNode.value);

    let typeNode = children[keyIdx + 2];

    let defNode = children[keyIdx + 3];


    node.name = name;
    node.namespace = namespace;
    node.isStatic = isStatic;
    node.typeNode = typeNode;

    node.isConst = isConst;
    node.defNode = defNode;


}

function getNamespaceIdent(node: AstNode) {
    let id = NamespaceIdentity.Public;
    if (node) {//as3如果没有Namespace,默认private
        let v = solveIdentifierValue(node.value);
        if (v === "protected") {
            id = NamespaceIdentity.Protected;
        } else if (v === "private") {
            id = NamespaceIdentity.Private;
        }
    }
    return id;
}