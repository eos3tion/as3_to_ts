export const Config = {
    /**
     * 是否使用ClassHelper处理static var
     */
    useHelperForStaticGetter: true,
    /**
     * 是否使用 const enum XXX {} 处理全Literal类型的class
     */
    useConstEnumForLiteralClass: true,
    /**
     * 将 var 改为 let
     */
    changeVarToLet: false,
    /**
     * TODO 
     * 调整全static的类，方法改为`export function`  
     * 如果剩下的都是可变成 enum 的，则自动按 enum 输出
     */
    convertStaticClassToExportFunction: false,
    /**
     * 创建一个有序的导入文件  
     * 优先输出引用少的文件，排除`Laya`库的代码  
     * 
     */
    createOrderedImportFile: false,
}