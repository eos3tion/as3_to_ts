import { appendTo } from "./Helper";
import type { FileData } from "./SolveAST";

export function createOrderedImportFile(files: FileData[], callback: { (file: string, cnt: string) }) {
    //剔除不被别的引用的文件
    files = files.filter(f => !!f.refed);
    const outfiles = [] as FileData[];
    let closed = {} as { [name: string]: true };
    while (true) {
        let inLen = outfiles.length;
        solveFiles(files, outfiles, closed);
        if (outfiles.length === inLen || files.length === 0) {
            break
        }
    }
    //将剩下的files中
    if (files.length) {
        let dict = {} as { [name: string]: FileData };
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            dict[file.fullName] = file;
        }
        let fff = [] as ReturnType<typeof checkFile>[];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            fff.push(checkFile(file, dict));
        }
        //剩下的文件，按引用数排序
        appendTo(
            fff.sort((b, a) => a.refs.length - b.refs.length),
            outfiles
        );
    }

    callback("Import.ts", outfiles.map(out).join("\n"));
}

function solveFiles(files: FileData[], outfiles: FileData[], closed: { [name: string]: true }) {
    let j = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const imports = file.imports;
        let xj = 0;
        if (imports.length > 0) {
            for (let x = 0; x < imports.length; x++) {
                let fname = imports[x];
                if (!closed[fname]) {
                    imports[xj++] = fname;
                }
            }
            imports.length = xj;
        }
        if (xj === 0) {
            outfiles.push(file);
            closed[file.fullName] = true;
        } else {
            files[j++] = file;
        }
    }
    files.length = j;
}

function out(file: FileData) {
    return `import "./${file.path.replaceAll("\\", "/")}"`;
}

function getOrder(file: FileData) {
    return 1E8 - file.imports.length * 1E5 + file.refed.length;
}


function checkFile(file: FileData, dict: { [fullname: string]: FileData }) {
    let checked = {};
    let unsolved = [file];
    while (unsolved.length) {
        let cur = unsolved.pop();
        let imports = cur.imports;
        for (let i = 0; i < imports.length; i++) {
            const imp = imports[i];
            let f = dict[imp];
            if (f) {
                if (!checked[imp]) {
                    unsolved.push(f)
                }
            }
        }
        checked[cur.fullName] = true;
    }
    return { file: file, refs: Object.keys(checked) };
}