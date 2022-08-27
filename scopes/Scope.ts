import { appendTo } from "../Helper";

export class Scope<T extends Node> {
    subs: { [name: string]: T };
    get depences() {
        const list = [] as Uri[];
        const subs = this.subs;
        for (let name in subs) {
            const sub = subs[name];
            const depences = sub.depences;
            if (depences) {
                appendTo(depences, list);
            }
        }
        return list;
    }
}
