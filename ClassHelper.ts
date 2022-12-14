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
        ref.__className = proto.__className = name;
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
     * ??????getter,setter
     */
    export function gs(ref: Class, params: any[]) {
        let proto = ref.prototype;
        for (let i = 0; i < params.length; i += 3) {
            let name: string = params[i];
            let getter: { (): any } = params[i + 1];
            let setter: { (value: any): void } = params[i + 2];
            if (getter) {
                addSuperGetter(proto, name);
            }
            if (setter) {
                addSuperSetter(proto, name);
            }
            let sup = proto;
            while (sup && (!getter || !setter)) {
                sup = Object.getPrototypeOf(sup);
                if (sup) {
                    let desc = Object.getOwnPropertyDescriptor(sup, name);
                    if (desc) {
                        if (!setter) {
                            setter = desc.set;
                        }
                        if (!getter) {
                            getter = desc.get;
                        }
                    }
                }
            }
            Object.defineProperty(proto, name, {
                get: getter,
                set: setter,
                configurable: true,
                enumerable: true
            })
        }
    }

    function addSuperSetter(proto, name: string) {
        let setterKey = `super_set_${name}`;
        proto[setterKey] = function (value: any) {
            let handler: { (value: any): void }
            let sup = proto;
            //???????????????
            do {
                sup = Object.getPrototypeOf(sup);
                if (sup) {
                    let desc = Object.getOwnPropertyDescriptor(sup, name);
                    if (desc) {
                        handler = desc.set;
                    }
                } else {
                    break
                }
            } while (!handler)
            if (handler) {
                proto[setterKey] = handler;
                return handler.call(this, value);
            } else {
                console.error(`??????????????????[${name}]???setter`);
            }
        }
    }
    function addSuperGetter(proto, name: string) {

        let getterKey = `super_get_${name}`;
        proto[getterKey] = function () {
            let handler: { (): any }
            //???????????????
            let sup = proto;
            //???????????????
            do {
                sup = Object.getPrototypeOf(sup);
                if (sup) {
                    let desc = Object.getOwnPropertyDescriptor(sup, name);
                    handler = desc.get;
                } else {
                    break
                }
            } while (!handler)
            if (handler) {
                proto[getterKey] = handler;
                return handler.call(this);
            } else {
                console.error(`??????????????????[${name}]???getter`);
            }
        }
    }
}