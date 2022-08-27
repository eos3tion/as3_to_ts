export function solveIdentifierValue(msg: string | string[]) {
    if (typeof msg !== "string") {
        msg = msg[1];
    }
    return msg.slice(1, -1).replaceAll("\n", "\\n");
}

export function getNamespaceIdent(node: AstNode) {
    let v = "";
    if (node) {//as3如果没有Namespace,默认private
        v = solveIdentifierValue(node.value);
        if (v === "public" || v === "internal") {
            v = "";
        } else {
            v += " ";
        }
    }
    return v;
}
export function getChildIdx(children: AstNode[], start: number, type: NodeType, id?: NodeID) {

    if (start === -1) {
        start = 0;
    }
    for (; start < children.length; start++) {
        const child = children[start];
        if (child.type === type && (id === undefined || child.id === id)) {
            return start;
        }
    }
    return -1;
}

export function walkChildren<T>(node: AstNode, checker: { (node: AstNode): T }) {
    const willChecked = [node];
    while (willChecked.length) {
        let cur = willChecked.pop();
        let result = checker(cur);
        if (result) {
            return result;
        }
        let children = cur.children;
        for (let i = 0; i < children.length; i++) {
            willChecked.push(children[i]);
        }
    }
}

export function getParent(node: AstNode, type: NodeType, maxLevel = Infinity, id?: NodeID) {
    let parent = node.parent;
    let level = 1;
    while (level <= maxLevel && parent) {
        if (parent.type === type && (id === undefined || parent.id === id)) {
            return parent;
        }
        parent = parent.parent;
        level++;
    }
}

export function checkParents(node: AstNode, ...types: NodeType[]) {
    let parent = node.parent;
    let i = 0;
    do {
        if (parent && parent.type === types[i++]) {
            parent = parent.parent;
        } else {
            return false;
        }
    } while (i < types.length)
    return true;
}

export function appendTo(from: any[], to: any[]) {
    for (let i = 0; i < from.length; i++) {
        to.push(from[i]);
    }
}