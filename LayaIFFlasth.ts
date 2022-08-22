
const list = [
    "libs\\laya\\src\\__JS__.as",
    "libs\\laya\\src\\__INCLUDESTR__.as",
    "libs\\laya\\src\\XmlDom.as",
    "libs\\laya\\src\\wx.as",
    "libs\\laya\\src\\Worker.as",
    "libs\\laya\\src\\window.as",
    "libs\\laya\\src\\Uint8ClampedArray.as",
    "libs\\laya\\src\\Uint8Array.as",
    "libs\\laya\\src\\Uint32Array.as",
    "libs\\laya\\src\\Uint16Array.as",
    "libs\\laya\\src\\setTimeout.as",
    "libs\\laya\\src\\setInterval.as",
    "libs\\laya\\src\\require.as",
    "libs\\laya\\src\\Promise.as",
    "libs\\laya\\src\\Map.as",
    "libs\\laya\\src\\LayaGCS.as",
    "libs\\laya\\src\\Int32Array.as",
    "libs\\laya\\src\\Int16Array.as",
    "libs\\laya\\src\\ImageData.as",
    "libs\\laya\\src\\Float32Array.as",
    "libs\\laya\\src\\debugger.as",
    "libs\\laya\\src\\DataView.as",
    "libs\\laya\\src\\console.as",
    "libs\\laya\\src\\clearTimeout.as",
    "libs\\laya\\src\\clearInterval.as",
    "libs\\laya\\src\\Audio.as",
    "libs\\laya\\src\\ArrayBuffer.as",
    "libs\\laya\\src\\alert.as"
]

/**
 * 过滤Laya [IFFlash] 的一些类
 * @param fullName 
 */
export function importFilter(fullName: string) {
    return list.indexOf(fullName) > -1
}