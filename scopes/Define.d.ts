
const enum FileScopeType {
    /**
     * 文件本身
     */
    File = 0,
    /**
     * 文件中的Class
     */
    Class = 1,
    /**
     * 文件中可处理为常量的常量集
     */
    Enum = 2,
    /**
     * 静态函数
     */
    StaticFunc = 3,
    /**
     * 接口
     */
    Interface = 4,
}

type Uri = string;
interface Node {
    name: string;
    type: FileScopeType;

    /**
     * 依赖项
     */
    depences?: Uri[];
}

const enum NamespaceIdentity {
    Public = 0,
    Protected = 1,
    Private = 2,
}

interface ScopeAstNode extends AstNode {
    name: string;
    namespace: NamespaceIdentity;
    isStatic: boolean;
    typeNode: AstNode;
}

interface FunctionAstNode extends ScopeAstNode {

    scope: AstNode;
    isConstructor: boolean;
    isOverride: boolean;
    paramsCon: AstNode;
}

interface VariableNode extends ScopeAstNode {
    isConst: boolean;
    defNode: AstNode;
}