import { readAstFile } from "./ParseAST";
import { solveAst } from "./SolveAST";
import fs from "fs";
import path from "path";
import { formatContent } from "./FormatTsContent";
import { Config } from "./Config";

const inputBaseDir = "D:\\workspace\\wallan2022\\sjcq\\game";
const outDir = "D:\\workspace\\wallan2022\\sjcq\\chuanqi";

function mkdirs(dir: string) {
    const paths = dir.split(path.sep);
    var len = paths.length;
    if (len == 0) {
        return
    }
    var p = paths[0];
    if (!fs.existsSync(p)) {
        return
    }
    for (var i = 1, len = paths.length; i < len; i++) {
        p = path.join(p, paths[i]);
        if (fs.existsSync(p)) {
            var ret = fs.statSync(p);
            if (!ret.isDirectory()) {
                throw Error("无法创建文件夹" + p);
            }
        } else {
            fs.mkdirSync(p);
        }
    }
}

readAstFile("ast.txt", dict => {
    solveAst(dict, (file, cnt) => {
        const p = path.join(outDir, file);
        mkdirs(path.dirname(p));
        if (Config.addFileTrace) {
            cnt = `console.log(${file})\n` + cnt;
        }
        fs.writeFileSync(p, formatContent(cnt));
    }, inputBaseDir, file => file.indexOf("libs\\laya") == -1);
    const helperFile = "ClassHelper.ts";
    fs.copyFileSync(path.join(__dirname, helperFile), path.join(outDir, helperFile));
})