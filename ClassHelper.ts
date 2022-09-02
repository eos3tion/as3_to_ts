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

module $H {

    const classes = {} as { [name: string]: Class }
    const interfaces = {} as { [name: string]: Interface }
    export function clz(ref: Class, name: string, interfaces?: string[]) {
        classes[name] = ref;
        const proto = ref.prototype;
        let define = Object.getOwnPropertyDescriptor(proto, "className");
        if (define && define.get && !define.set) {
            proto.constructor.__className = name;
        } else {
            Object.defineProperty(proto, "className", {
                value: name,
                configurable: true,
                enumerable: false,
                writable: true
            })
        }
        if (interfaces) {
            proto.interfaces = interfaces;
        }
    }

    export function ifc(name: string, base?: string[]) {
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
    export function isIfc(ref: any, inter: string) {
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

    export function stc(_class: Class, def: any[]) {
        for (let i = 0, sz = def.length; i < sz; i += 2) {
            if (def[i] == 'length')
                _class.length = def[i + 1].call(_class);
            else {
                (function () {
                    const name = def[i];
                    const getfn = def[i + 1];
                    Object.defineProperty(_class, name, {
                        get() {
                            delete this[name];
                            return this[name] = getfn.call(this);
                        },
                        set(v) {
                            delete this[name];
                            this[name] = v;
                        },
                        enumerable: true,
                        configurable: true
                    });
                })()
            }
        }
    }

    /**
     * 处理getter,setter
     */
    export function gs(ref: Class, params: any[]) {
        let proto = ref.prototype;
        for (let i = 0; i < params.length; i += 3) {
            let name: string = params[i];
            let getter: { (): any } = params[i + 1];
            let setter: { (value: any): void } = params[i + 2];
            do {
                let flag = true;
                if (!getter || !setter) {
                    let sup = Object.getPrototypeOf(proto);
                    if (sup) {
                        let desc = Object.getOwnPropertyDescriptor(sup, name);
                        if (desc) {
                            if (!setter) {
                                setter = desc.set;
                                if (setter) {
                                    sup[`$_set_${name}`] = setter;
                                }
                            }
                            if (!getter) {
                                getter = desc.get;
                                if (getter) {
                                    sup[`$_get_${name}`] = setter;
                                }
                            }
                            flag = false;
                        }
                    }
                }
                if (flag) {
                    break;
                }
            } while (true)
            Object.defineProperty(proto, name, {
                get: getter,
                set: setter,
                configurable: true,
                enumerable: true
            })
        }
    }
}