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