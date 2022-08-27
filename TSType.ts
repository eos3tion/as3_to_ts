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
export function getTSType(type: string) {
    if (type in as2tsType) {
        return as2tsType[type];
    }
    return type;
}


const typeofValue = {
    "Number": "number",
    "int": "number",
    "uint": "number",
    "Object": "object",
    "String": "string",
    "Boolean": "boolean",
} as { [key: string]: string }

export function getInstanceofType(type: string) {
    return typeofValue[type];
}