import { getChildIdx, solveIdentifierValue } from "./Helper";




export type ClassData = ReturnType<typeof getClassData>;
/**
 * 获取Class上下文
 * @param node 
 * @returns 
 */
export function getClassData(node: AstNode) {
    const children = node.children;
    let name = solveIdentifierValue(node.value);
    let extIdx = getChildIdx(children, 0, NodeName.KeywordNode, NodeID.KeywordExtendsID);
    let baseClass = "";
    if (extIdx > -1) {
        baseClass = solveIdentifierValue(children[++extIdx].value);
    } else {
        extIdx = 0;
    }



    const classData = {
        name,
        baseClass,
        dict: {} as ClassDict,
        others: [] as AstNode[],
        constructors: [] as AstNode[],
        setterDict: {} as ClassDict,
        staticDict: {} as ClassDict,
        node
    }

    let scopeIdx = getChildIdx(children, extIdx, NodeName.ScopedBlockNode);
    let scope = children[scopeIdx];
    if (scope) {
        solveClassScope(scope, classData);
    }

    return classData;


    function solveClassScope(node: AstNode, classData: ClassData) {
        const children = node.children;
        const { dict, constructors, others, name: className, setterDict, staticDict } = classData;
        // 暂时不区分 public 还是 private protected
        // const pubDict = {} as ClassDict;
        //第一次遍历，得到类中`属性 / 方法`
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const type = child.type;
            let name: string;
            let isStatic = false;
            switch (type) {
                case NodeName.FunctionNode:
                case NodeName.GetterNode:
                case NodeName.SetterNode:
                    name = getFunctionName(child);
                    isStatic = getIsStatic(child);
                    checkFunctionScope(child);
                    break;
                case NodeName.VariableNode:
                    name = getVariableName(child);
                    isStatic = getIsStatic(child);
                    break;
            }
            if (name) {
                if (className === name) {
                    constructors.push(child);
                } else {
                    if (isStatic) {
                        staticDict[name] = child;
                    } else {
                        dict[name] = child;
                    }
                    if (type === NodeName.SetterNode) {
                        setterDict[name] = child;
                    }
                }
            } else {
                others.push(child);
            }
        }
    }

    function getIsStatic(node: AstNode) {
        const children = node.children;
        let isStatic = false;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.type === NodeName.ModifiersContainerNode) {
                //检查 children
                const subs = child.children;
                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    if (sub.type === NodeName.ModifierNode) {
                        let v = sub.value;
                        if (v === `"static"`) {
                            isStatic = true;
                        }
                    }
                }
            }
        }
        return isStatic;
    }

}

function getVariableName(node: AstNode) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeName.KeywordNode) {//关键字
            const nameNode = children[i + 1];
            return solveIdentifierValue(nameNode.value);
        }
    }
}

function getFunctionName(node: AstNode) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeName.IdentifierNode) {
            return solveIdentifierValue(child.value);
        }
    }
}

export function checkFunctionScope(node: AstNode) {
    let scope = getFunctionScope(node);
    if (!scope) {
        return
    }
    const children = scope.children;
    const dict = {} as ClassDict;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        let name: string;
        switch (child.type) {
            case NodeName.FunctionNode:
                name = getFunctionName(child);
                checkFunctionScope(child);
                break;
            case NodeName.VariableNode:
                name = getVariableName(child);
                break;
        }
        if (name) {
            dict[name] = child;
        }
    }
    scope.dict = dict;
}

function getFunctionScope(child: AstNode) {
    const funChildren = child.children;
    let scopeIdx = getChildIdx(funChildren, 0, NodeName.ScopedBlockNode);
    let scope = funChildren[scopeIdx];
    return scope as FunctionScopeNode;
}

export function isScopeNode(node: AstNode): node is FunctionScopeNode {
    return node.type === NodeName.ScopedBlockNode && (node as FunctionScopeNode).dict != undefined;
}