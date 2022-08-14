import { readAstFile } from "./ParseAST";
import { solveAst } from "./SolveAST";
import fs from "fs";
import path from "path";

const inputBaseDir = "D:\\workspace\\projects\\wallan2022\\chuanqi\\chuanqi-laya-as3";
const outDir = "D:\\workspace\\projects\\wallan2022\\chuanqi\\ts";


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

readAstFile("ast1.txt", dict => {
    solveAst(dict, (file, cnt) => {
        const p = path.join(outDir, path.relative(inputBaseDir, file).replace(".as", ".ts"));
        mkdirs(path.dirname(p));
        fs.writeFileSync(p, cnt);
    }, inputBaseDir, file => file.indexOf("libs\\laya") == -1)
})