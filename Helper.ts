export function solveIdentifierValue(msg: string | string[]) {
    if (typeof msg !== "string") {
        msg = msg[1];
    }
    return msg.slice(1, -1).replaceAll("\n", "\\n");
}

export function getChildIdx(children: AstNode[], start: number, type: NodeName, id?: NodeID) {
    let i = start;
    for (; i < children.length; i++) {
        const child = children[i];
        if (child.type === type && (id === undefined || child.id === id)) {
            return i;
        }
    }
    return -1;
}

export function getParent(node: AstNode, type: NodeName, maxLevel = Infinity, id?: NodeID) {
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

export function checkParents(node: AstNode, ...types: NodeName[]) {
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