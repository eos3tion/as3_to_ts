/**
 * 用于转成  
 * ```ts
 * const enum EnumXXX {
 * 
 * }
 * ```
 */
interface EnumData extends Node {
    type: FileScopeType.Enum;
}
