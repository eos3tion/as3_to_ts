import type { FileData } from "./SolveAST";

export function createOrderedImportFile(files: FileData[], callback: { (file: string, cnt: string) }) {
    const cnt = files.filter(a => !!a.refed).sort((a, b) => {
        return a.refed.length - b.refed.length;
    })
        .map(file => `import "${file.path.replaceAll("\\", "/")}"`)
        .join("\n")
    callback("Import.ts", cnt);
}