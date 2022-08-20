type Class = {
    prototype: LayaASClass
    new(): LayaASClass
} & any

interface LayaASClass {
    className?: string;
    interfaces?: string[];
}


interface Interface {
    name: string;
    base?: string[];
}

const classes = {} as { [name: string]: Class }
const interfaces = {} as { [name: string]: Interface }
function $class(ref: Class, name: string, interfaces: string[]) {
    classes[name] = ref;
    const proto = ref.prototype;
    proto.className = name;
    proto.interfaces = interfaces;
}

function $interface(name: string, base?: string[]) {
    interfaces[name] = {
        name,
        base
    }
}


function appendTo(from: any[], to: any[]) {
    for (let i = 0; i < from.length; i++) {
        to.push(from[i]);
    }
}
const willChecked = [] as string[];
function $isInterface<T extends LayaASClass>(ref: T, inter: string) {
    const ints = ref.interfaces;
    if (ints) {
        willChecked.length = 0;
        appendTo(ints, willChecked);
        while (willChecked.length > 0) {
            let intName = willChecked.pop();
            if (intName === inter) {
                return true;
            } else {
                const inter = interfaces[intName];
                if (inter) {
                    const base = inter.base;
                    if (base) {
                        appendTo(base, willChecked);
                    }
                }
            }
        }
    }
    return false;
}