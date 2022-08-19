
import ts from "typescript";
export function formatContent(cnt: string) {
    const sourceFile = ts.createSourceFile("doFormat", cnt, ts.ScriptTarget.ES2020, false);
    const formatting = ts.
        //@ts-ignore
        formatting;
    let edits = formatting.formatDocument(sourceFile, formatting.getFormatContext(ts.getDefaultFormatCodeSettings()))
    let result = cnt;
    for (let i = edits.length - 1; i >= 0; i--) {
        let change = edits[i];
        let head = result.slice(0, change.span.start);
        let tail = result.slice(change.span.start + change.span.length);
        result = head + change.newText + tail;
    }
    return result;
}