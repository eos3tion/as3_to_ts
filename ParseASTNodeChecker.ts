import fs from "fs";

export function checkNode(node: AstNode, content: string) {
    const checker = checkers[node.type];
    if (checker) {
        checker(node, content);
    }
}

export function needCheck(type: string) {
    return type in checkers;
}

const checkers = {} as { [type in NodeType]: { (node: AstNode, content: string) } }

checkers[NodeType.ParameterNode] = function (node: ParamNode, content: string) {
    const nameNode = node.children[0];
    if (node.start !== nameNode.start) {
        let p = content.substring(node.start, nameNode.start).trim();
        if (p === "...") {
            node.hasRest = true;
        }
    }
}

checkers[NodeType.RegExpLiteralNode] = function (node: RegExpLiteralNode, content: string) {
    node.literal = content.slice(node.start, node.end)
}