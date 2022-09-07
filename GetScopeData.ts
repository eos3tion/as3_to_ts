import { Config } from "./Config";
import { appendTo, getChildIdx, getNamespaceIdent, solveIdentifierValue, walkChildren } from "./Helper";




export type ClassData = ReturnType<typeof getClassData>;
/**
 * 获取Class上下文
 * @param node 
 * @returns 
 */
export function getClassData(node: AstNode, isLaya?: boolean) {
    const children = node.children;
    let name = solveIdentifierValue(node.value);
    let extIdx = getChildIdx(children, 0, NodeType.KeywordNode, NodeID.KeywordExtendsID);
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
        getterDict: {} as ClassDict,
        staticDict: {} as ClassDict,
        node,
        hasEnum: false,
        enumData: {} as ClassDict,
        staVarWithFunCall: {} as ClassDict,
        staticFuns: {} as ClassDict,
        staticGetters: {} as ClassDict,
        staticSetters: {} as ClassDict,
        funs: {} as ClassDict,
        /**
         * private 方法，子类有同名方法的次数
         */
        priFuns: {} as { [name: string]: number },
        isEnum,
    }

    let scopeIdx = getChildIdx(children, extIdx, NodeType.ScopedBlockNode);
    let scope = children[scopeIdx];
    if (scope) {
        solveClassScope(scope, classData);
    }

    return classData;
    function isEnum(this: ClassData) {
        return this.hasEnum && Config.useConstEnumForLiteralClass;
    }

    function solveClassScope(node: AstNode, classData: ClassData) {
        const children = node.children;
        const
            { dict, constructors, others, name: className,
                setterDict, getterDict, staticDict, staVarWithFunCall,
                enumData, staticFuns, staticGetters, staticSetters, priFuns,
                funs
            }
                = classData;
        const file = node.root.file;
        const noStaticFun = Config.convertStaticFuncToExportFunctionIgonreFiles.indexOf(file) > -1;

        // 暂时不区分 public 还是 private protected
        // const pubDict = {} as ClassDict;
        //第一次遍历，得到类中`属性 / 方法`
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const type = child.type;
            let name: string;
            let isStatic = false;
            let isPravite = false;
            switch (type) {
                case NodeType.FunctionNode:
                case NodeType.GetterNode:
                case NodeType.SetterNode:
                    name = getFunctionName(child);
                    ({ isStatic, isPravite } = getIsStatic(child));
                    checkFunctionScope(child);
                    break;
                case NodeType.VariableNode:
                    name = getVariableName(child);
                    ({ isStatic } = getIsStatic(child));
                    break;
                default:
                    break;
            }
            if (name) {
                if (!isStatic && className === name) {
                    //检查 child 有没有任何代码
                    const children = child.children;
                    let idx = getChildIdx(children, 0, NodeType.ScopedBlockNode);
                    if (idx > 0) {
                        let block = children[idx];
                        if (block.children.length > 0) {
                            constructors.push(child);
                        }
                    }
                } else {
                    if (isStatic) {
                        if (type === NodeType.FunctionNode && !isLaya && Config.convertStaticFuncToExportFunction && !noStaticFun) {
                            staticFuns[name] = child;
                        } else if (type === NodeType.SetterNode) {
                            staticSetters[name] = child;
                        } else if (type === NodeType.GetterNode) {
                            staticGetters[name] = child;
                        }
                        staticDict[name] = child;
                    } else {
                        dict[name] = child;
                        if (type === NodeType.SetterNode) {
                            setterDict[name] = child;
                        } else if (type === NodeType.GetterNode) {
                            getterDict[name] = child;
                        } else if (type === NodeType.FunctionNode) {//暂时不管 private getter setter的情况，应该不会有人这么无聊这样写代码吧
                            if (isPravite) {
                                priFuns[name] = 0;
                            }
                            funs[name] = child;
                        }
                    }

                }
            } else {
                others.push(child);
            }
        }

        let hasEnum = false;
        //检查是否都有默认值，并且值只有字符串和数值类型
        for (let name in staticDict) {
            const child = staticDict[name];
            if (child.type !== NodeType.VariableNode) {
                continue
            }
            const children = child.children;
            const keyNodeIdx = getChildIdx(children, 0, NodeType.KeywordNode);
            if (keyNodeIdx > -1) {
                const defNode = children[keyNodeIdx + 3];
                let keyNode = children[keyNodeIdx];
                let checkEnum = true;
                if (keyNode.id !== NodeID.KeywordConstID) {
                    checkEnum = false;
                }
                if (defNode) {
                    //defNode中，不能有funCall
                    const result = !checkEnum || walkChildren(defNode, tester => {
                        const ttype = tester.type;
                        if (ttype === NodeType.FunctionCallNode || ttype === NodeType.ObjectLiteralNode || ttype === NodeType.ArrayLiteralNode || ttype === NodeType.VectorLiteralNode || ttype === NodeType.RegExpLiteralNode) {
                            return true;
                        } else if (ttype === NodeType.MemberAccessExpressionNode) {
                            //检查主体是不是本身
                            const [left] = tester.children;
                            let val = solveIdentifierValue(left.value);
                            if (val !== className) {
                                return true;
                            }
                        }
                    })

                    if (result) {
                        staVarWithFunCall[name] = defNode;
                    } else {
                        hasEnum = true;
                        enumData[name] = defNode;
                    }
                }
            }
        }

        classData.enumData = enumData;
        classData.hasEnum = !isLaya && hasEnum;

    }

    function getIsStatic(node: AstNode) {
        const children = node.children;
        let isStatic = false;
        let ident = "";
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const type = child.type;
            if (type === NodeType.NamespaceIdentifierNode) {
                ident = getNamespaceIdent(child, true);
            } else if (type === NodeType.ModifiersContainerNode) {
                //检查 children
                const subs = child.children;
                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    if (sub.type === NodeType.ModifierNode) {
                        let v = sub.value;
                        if (v === `"static"`) {
                            isStatic = true;
                        }
                    }
                }
            }
        }
        return { isStatic, isPravite: ident === "private" };
    }

}

function getVariableName(node: AstNode) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeType.KeywordNode) {//关键字
            const nameNode = children[i + 1];
            return solveIdentifierValue(nameNode.value);
        }
    }
}

function getFunctionName(node: AstNode) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === NodeType.IdentifierNode) {
            return solveIdentifierValue(child.value);
        }
    }
}

function getParamName(param: AstNode) {
    const paramNameNode = param.children[0];
    return solveIdentifierValue(paramNameNode.value);
}

export function checkFunctionScope(node: AstNode) {
    let scope = getFunctionScope(node);
    if (!scope) {
        return
    }
    const dict = {} as ClassDict;
    scope.dict = dict;
    const paramNodes = getParamNodes(node);
    if (paramNodes) {
        for (let i = 0; i < paramNodes.length; i++) {
            const param = paramNodes[i];
            let name = getParamName(param);
            if (name) {
                dict[name] = param;
            }
        }
    }
    const willChecked = [scope];
    while (willChecked.length) {
        const child = willChecked.pop();
        let name: string;
        switch (child.type) {
            case NodeType.FunctionNode:
                name = getFunctionName(child);
                checkFunctionScope(child);
                break;
            case NodeType.VariableNode:
                name = getVariableName(child);
                break;
            default://查找children中的children是否有VariableNode
                const subs = child.children;
                if (subs.length) {
                    appendTo(subs, willChecked);
                }
                break;
        }
        if (name) {
            dict[name] = child;
        }
    }
}

function getFunctionScope(child: AstNode) {
    const funChildren = child.children;
    let scopeIdx = getChildIdx(funChildren, 0, NodeType.ScopedBlockNode);
    let scope = funChildren[scopeIdx];
    return scope as FunctionScopeNode;
}

function getParamNodes(child: AstNode) {
    const funChildren = child.children;
    let conIdx = getChildIdx(funChildren, 0, NodeType.ContainerNode);
    const conNode = funChildren[conIdx];
    return conNode?.children;
}

export function isScopeNode(node: AstNode): node is FunctionScopeNode {
    return node.type === NodeType.ScopedBlockNode && (node as FunctionScopeNode).dict != undefined;
}