
interface AstNode {
    /**
     * `BlockNode(BlockID) BRACES 35:16 loc: 1357-1480 abs: 1357-1480 D:\workspace\wallan2022\sjcq\game\src\com\game\kingcity\panel\KingCityOwnerPanelExt.as`
     * `type`为`BlockNode`
     */
    type: string;
    /**
     * `BlockNode(BlockID) BRACES 35:16 loc: 1357-1480 abs: 1357-1480 D:\workspace\wallan2022\sjcq\game\src\com\game\kingcity\panel\KingCityOwnerPanelExt.as`
     * `id`为`BlockID`
     */
    id: string;
    /**
     * `BlockNode(BlockID) BRACES 35:16 loc: 1357-1480 abs: 1357-1480 D:\workspace\wallan2022\sjcq\game\src\com\game\kingcity\panel\KingCityOwnerPanelExt.as`
     * 从`node`之后到形如`\d+:\d+`之前的部分  上面`BRACES` 为 value
     * value可以为空，也可以是多个以" "分隔的字符串
     */
    value: string | string[];
    /**
     * 取的 `abs: 1357-1480` 中，`-` 前面数字部分`1357` 
     */
    start: number;
    /**
     * 取的 `abs: 1357-1480` 中，`-` 后面数字部分`1480` 
     */
    end: number;
    parent?: AstNode;
    /**
     * 根节点，必为FileNode
     */
    root: AstNode;
    /**
     * 文件路径  
     * 只有FileNode保存此值
     */
    file?: string;
    /**
     * 子节点
     */
    children: AstNode[];
    /**
     * 根节点(FileNode)为0，每深一级子节点 level + 1  
     * ast文件，体现为`  `的数量，没2个空格，增加1级  
     */
    level: number;
}

interface FunctionScopeNode extends AstNode {
    dict: ClassDict;
}

const enum NodeName {
    FileNode = "FileNode",
    PackageNode = "PackageNode",
    ImportNode = "ImportNode",
    /**
     * class a implements b,c{
     * }
     * 跟在 KeywordNode(KeywordImplementsID) 后的部分
     */
    TransparentContainerNode = "TransparentContainerNode",
    ClassNode = "ClassNode",
    InterfaceNode = "InterfaceNode",
    NilNode = "NilNode",
    ReturnNode = "ReturnNode",
    /**
     * 字符串的常量节点
     * LiteralNode(LiteralBooleanID)    Boolean true/false
     * LiteralNode(LiteralNullID)   Null    null
     * LiteralNode(LiteralObjectID) Object  void 0
     * LiteralNode(LiteralStringID)
     */
    LiteralNode = "LiteralNode",
    /**
     * 数字常量节点
     * `NumericLiteralNode(LiteralIntegerZeroID) Number 0`  
     * 取`0`即可
     */
    NumericLiteralNode = "NumericLiteralNode",
    ScopedBlockNode = "ScopedBlockNode",

    FunctionNode = "FunctionNode",
    /**
     * 函数对象  
     * children[0] FunctionNode
     */
    FunctionObjectNode = "FunctionObjectNode",
    SetterNode = "SetterNode",
    GetterNode = "GetterNode",
    /**
     * 标识符
     */
    IdentifierNode = "IdentifierNode",
    /**
     * public protected private 标识符
     */
    NamespaceIdentifierNode = "NamespaceIdentifierNode",
    /**
     * ObjectLiteralValuePairNode 
     * LabeledStatementNode 
     * 后面跟着的标识符
     */
    NonResolvingIdentifierNode = "NonResolvingIdentifierNode",
    /**
     * 一般下面的 children 是 `ModifierNode` 值为 `static`
     */
    ModifiersContainerNode = "ModifiersContainerNode",
    /**
     * 修饰符节点
     * DynamicID dynamic  
     * FinalID final  
     * OverrideID override  √
     * StaticID static  √
     */
    ModifierNode = "ModifierNode",
    /**
     * 关键字节点
     * KeywordClassID class  
     * KeywordInterfaceID interface  
     * KeywordConstID const  
     * KeywordExtendsID extends  
     * KeywordImplementsID implements  
     * KeywordFunctionID function  
     * KeywordGetID get  
     * KeywordSetID set  
     * KeywordNewID new  
     * KeywordVarID var  
     */
    KeywordNode = "KeywordNode",

    /**
     * ( ) 里面的内容 children一般为 `ParameterNode`
     */
    ContainerNode = "ContainerNode",
    /**
     * 参数节点  
     * children[0] `IdentifierNode` 参数变量名  
     * children[1] `IdentifierNode` 参数的数据类型  
     * children[2] 可选，`LiteralNode` 默认值
     */
    ParameterNode = "ParameterNode",

    /**
     * VoidID void
     * SuperID super
     * IdentifierID this rest any
     * ```
     * MemberAccessExpressionNode(MemberAccessExpressionID) "." 9:119 loc: 430-442 abs: 430-442 D:\workspace\wallan2022\sjcq\game\src\com\logic\nsaext\handler\ResNSAExtNSAActivityCompetitionGetRewardHandler.as
     *   LanguageIdentifierNode(IdentifierID) "this" 9:119 loc: 430-434 abs: 430-434 D:\workspace\wallan2022\sjcq\game\src\com\logic\nsaext\handler\ResNSAExtNSAActivityCompetitionGetRewardHandler.as
     *   IdentifierNode(IdentifierID) "message" 9:124 loc: 435-442 abs: 435-442 D:\workspace\wallan2022\sjcq\game\src\com\logic\nsaext\handler\ResNSAExtNSAActivityCompetitionGetRewardHandler.as
     * ```
     * this.message
     */
    LanguageIdentifierNode = "LanguageIdentifierNode",
    /**
     * 静态数组  
     * 如 `var a:Array = [EnumJob.ToString(vo.job)]`  中 `[EnumJob.ToString(vo.job)]`
     */
    ArrayLiteralNode = "ArrayLiteralNode",

    /**
     * 静态Vector
     */
    VectorLiteralNode = "VectorLiteralNode",
    /**
     * Object常量
     * 一般子集为 ContainerNode "BRACES"
     */
    ObjectLiteralNode = "ObjectLiteralNode",
    /**
     * Object的键值对数据
     * { a:b } 其中 `a:b`则为该节点
     * 有两个字节点  
     * 
     */
    ObjectLiteralValuePairNode = "ObjectLiteralValuePairNode",
    /**
     * 正则表达式节点
     */
    RegExpLiteralNode = "RegExpLiteralNode",
    /**
     * Vector.<int>
     * ```
     * TypedExpressionNode(TypedExpressionID) 43:16 loc: 1505-1530 abs: 1505-1530 D:\workspace\wallan2022\sjcq\game\src\com\game\skill\panelShow\ShootOffSkillUIShowControl.as
     *   IdentifierNode(IdentifierID) "Vector" 43:16 loc: 1505-1511 abs: 1505-1511 D:\workspace\wallan2022\sjcq\game\src\com\game\skill\panelShow\ShootOffSkillUIShowControl.as
     *   IdentifierNode(IdentifierID) "int" 43:24 loc: 1513-1529 abs: 1513-1529 D:\workspace\wallan2022\sjcq\game\src\com\game\skill\panelShow\ShootOffSkillUIShowControl.as
     * ```
     */
    TypedExpressionNode = "TypedExpressionNode",
    /**
     * `holeIndices.length`
     * ```
     * MemberAccessExpressionNode(MemberAccessExpressionID) "." 8:36 loc: 184-202 abs: 184-202 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *   IdentifierNode(IdentifierID) "holeIndices" 8:36 loc: 184-195 abs: 184-195 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *   IdentifierNode(IdentifierID) "length" 8:48 loc: 196-202 abs: 196-202 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     * ```
     */
    MemberAccessExpressionNode = "MemberAccessExpressionNode",
    /**
     * `holeIndices[0]`
     * ```
     * DynamicAccessNode(ArrayIndexExpressionID) "[]" 9:32 loc: 237-251 abs: 237-251 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *   IdentifierNode(IdentifierID) "holeIndices" 9:32 loc: 237-248 abs: 237-248 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *   NumericLiteralNode(LiteralIntegerZeroID) Number 0 9:44 loc: 249-250 abs: 249-250 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     * ```
     */
    DynamicAccessNode = "DynamicAccessNode",
    /**
     * ```
     * [Event(name = "change", type = "laya.events.Event")]
     * class XXX {
     * 
     * }
     * ```
     * 中 `[Event(name = "change", type = "laya.events.Event")]`  
     * 直接跳过即可
     * 
     */
    MetaTagsNode = "MetaTagsNode",
    /**
     * ```
     * var xx:xx = aa.bb;
     * ```
     */
    VariableNode = "VariableNode",
    /**
     * ```
     * var xx:xx = xxx,
     *    bb:cc = dd,
     * ```
     * `bb:cc = dd` 为此节点
     */
    ChainedVariableNode = "ChainedVariableNode",
    VariableExpressionNode = "VariableExpressionNode",
    /**
     * 三元操作符  
     * ```
     * TernaryOperatorNode(TernaryExpressionID) "?" 169:57 loc: 5433-5454 abs: 5433-5454 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *   BinaryOperatorGreaterThanNode(Op_GreaterThanID) ">" 169:57 loc: 5433-5442 abs: 5433-5442 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *     MemberAccessExpressionNode(MemberAccessExpressionID) "." 169:57 loc: 5433-5436 abs: 5433-5436 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *       IdentifierNode(IdentifierID) "b" 169:57 loc: 5433-5434 abs: 5433-5434 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *       IdentifierNode(IdentifierID) "x" 169:59 loc: 5435-5436 abs: 5435-5436 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *     MemberAccessExpressionNode(MemberAccessExpressionID) "." 169:63 loc: 5439-5442 abs: 5439-5442 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *       IdentifierNode(IdentifierID) "c" 169:63 loc: 5439-5440 abs: 5439-5440 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *       IdentifierNode(IdentifierID) "x" 169:65 loc: 5441-5442 abs: 5441-5442 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *   MemberAccessExpressionNode(MemberAccessExpressionID) "." 169:69 loc: 5445-5448 abs: 5445-5448 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *     IdentifierNode(IdentifierID) "b" 169:69 loc: 5445-5446 abs: 5445-5446 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *     IdentifierNode(IdentifierID) "x" 169:71 loc: 5447-5448 abs: 5447-5448 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *   MemberAccessExpressionNode(MemberAccessExpressionID) "." 169:75 loc: 5451-5454 abs: 5451-5454 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *     IdentifierNode(IdentifierID) "c" 169:75 loc: 5451-5452 abs: 5451-5452 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     *     IdentifierNode(IdentifierID) "x" 169:77 loc: 5453-5454 abs: 5453-5454 D:\workspace\wallan2022\sjcq\game\libs\laya\src\laya\webgl\shapes\Earcut.as
     * ```
     * b.x > c.x ? b.x : c.x
     */
    TernaryOperatorNode = "TernaryOperatorNode",
    /**
     * if条件  
     * 子集为多个`ConditionalNode`
     * if`ConditionalNode`
     * else if`ConditionalNode`
     */
    IfNode = "IfNode",
    /**
     * switch
     */
    SwitchNode = "SwitchNode",
    /**
     * 条件节点  
     * 下面为多个 
     * `BinaryOperator` 节点以及一个`BlockNode`
     */
    ConditionalNode = "ConditionalNode",
    /**
     * IfNode 下
     * ConditionNode 下
     * BlockNode代表条件里面的内容
     */
    BlockNode = "BlockNode",

    /**
     * &&
     */
    BinaryOperatorLogicalAndNode = "BinaryOperatorLogicalAndNode",
    /**
     * &&=
     */
    BinaryOperatorLogicalAndAssignmentNode = "BinaryOperatorLogicalAndAssignmentNode",

    /**
     * ||
     */
    BinaryOperatorLogicalOrNode = "BinaryOperatorLogicalOrNode",
    /**
     * ||=
     */
    BinaryOperatorLogicalOrAssignmentNode = "BinaryOperatorLogicalOrAssignmentNode",
    /**
     * +
     */
    BinaryOperatorPlusNode = "BinaryOperatorPlusNode",
    /**
     * +=
     */
    BinaryOperatorPlusAssignmentNode = "BinaryOperatorPlusAssignmentNode",
    /**
     * -
     */
    BinaryOperatorMinusNode = "BinaryOperatorMinusNode",
    /**
     * -=
     */
    BinaryOperatorMinusAssignmentNode = "BinaryOperatorMinusAssignmentNode",
    /**
     * `*`
     */
    BinaryOperatorMultiplicationNode = "BinaryOperatorMultiplicationNode",
    /**
     * *=
     */
    BinaryOperatorMultiplicationAssignmentNode = "BinaryOperatorMultiplicationAssignmentNode",

    /**
     * %
     */
    BinaryOperatorModuloNode = "BinaryOperatorModuloNode",
    /**
     * %=
     */
    BinaryOperatorModuloAssignmentNode = "BinaryOperatorModuloAssignmentNode",
    /**
     * as
     */
    BinaryOperatorAsNode = "BinaryOperatorAsNode",
    /**
     * in
     */
    BinaryOperatorInNode = "BinaryOperatorInNode",
    /**
     * instanceof
     */
    BinaryOperatorInstanceOfNode = "BinaryOperatorInstanceOfNode",
    /**
     * is
     */
    BinaryOperatorIsNode = "BinaryOperatorIsNode",
    /**
     * =
     */
    BinaryOperatorAssignmentNode = "BinaryOperatorAssignmentNode",

    /**
     * &=
     */
    BinaryOperatorBitwiseAndAssignmentNode = "BinaryOperatorBitwiseAndAssignmentNode",
    /**
     * &
     */
    BinaryOperatorBitwiseAndNode = "BinaryOperatorBitwiseAndNode",
    /**
     * <<=
     */
    BinaryOperatorBitwiseLeftShiftAssignmentNode = "BinaryOperatorBitwiseLeftShiftAssignmentNode",
    /**
     * <<
     */
    BinaryOperatorBitwiseLeftShiftNode = "BinaryOperatorBitwiseLeftShiftNode",
    /**
     * |=
     */
    BinaryOperatorBitwiseOrAssignmentNode = "BinaryOperatorBitwiseOrAssignmentNode",
    /**
     * |
     */
    BinaryOperatorBitwiseOrNode = "BinaryOperatorBitwiseOrNode",
    /**
     * >>
     */
    BinaryOperatorBitwiseRightShiftNode = "BinaryOperatorBitwiseRightShiftNode",
    /**
     * >>=
     */
    BinaryOperatorBitwiseRightShiftAssignmentNode = "BinaryOperatorBitwiseRightShiftAssignmentNode",
    /**
     * >>>=
     */
    BinaryOperatorBitwiseUnsignedRightShiftAssignmentNode = "BinaryOperatorBitwiseUnsignedRightShiftAssignmentNode",
    /**
     * >>>
     */
    BinaryOperatorBitwiseUnsignedRightShiftNode = "BinaryOperatorBitwiseUnsignedRightShiftNode",
    /**
     * ^
     */
    BinaryOperatorBitwiseXorNode = "BinaryOperatorBitwiseXorNode",
    /**
     * ^=
     */
    BinaryOperatorBitwiseXorAssignmentNode = "BinaryOperatorBitwiseXorAssignmentNode",
    /**
     * ,
     * 连接多个表达式
     */
    BinaryOperatorCommaNode = "BinaryOperatorCommaNode",
    /**
     * /=
     */
    BinaryOperatorDivisionAssignmentNode = "BinaryOperatorDivisionAssignmentNode",
    /**
     * /
     */
    BinaryOperatorDivisionNode = "BinaryOperatorDivisionNode",
    /**
     * ==
     */
    BinaryOperatorEqualNode = "BinaryOperatorEqualNode",
    /**
     * ===
     */
    BinaryOperatorStrictEqualNode = "BinaryOperatorStrictEqualNode",
    /**
     * !=
     */
    BinaryOperatorNotEqualNode = "BinaryOperatorNotEqualNode",
    /**
     * !==
     */
    BinaryOperatorStrictNotEqualNode = "BinaryOperatorStrictNotEqualNode",
    /**
     * >=
     */
    BinaryOperatorGreaterThanEqualsNode = "BinaryOperatorGreaterThanEqualsNode",
    /**
     * >
     */
    BinaryOperatorGreaterThanNode = "BinaryOperatorGreaterThanNode",
    /**
     * <=
     */
    BinaryOperatorLessThanEqualsNode = "BinaryOperatorLessThanEqualsNode",
    /**
     * <
     */
    BinaryOperatorLessThanNode = "BinaryOperatorLessThanNode",
    /**
     * ++i
     */
    UnaryOperatorPreIncrementNode = "UnaryOperatorPreIncrementNode",
    /**
     * i++
     */
    UnaryOperatorPostIncrementNode = "UnaryOperatorPostIncrementNode",
    /**
     * --i
     */
    UnaryOperatorPreDecrementNode = "UnaryOperatorPreDecrementNode",
    /**
     * i--
     */
    UnaryOperatorPostDecrementNode = "UnaryOperatorPostDecrementNode",
    /**
     * !
     */
    UnaryOperatorLogicalNotNode = "UnaryOperatorLogicalNotNode",
    /**
     * ~
     */
    UnaryOperatorBitwiseNotNode = "UnaryOperatorBitwiseNotNode",
    /**
     * E4X规则，已弃用  
     * @
     */
    UnaryOperatorAtNode = "UnaryOperatorAtNode",
    /**
     * `void 0`
     * 中 void
     */
    UnaryOperatorVoidNode = "UnaryOperatorVoidNode",
    /**
     * typeof xxx
     */
    UnaryOperatorTypeOfNode = "UnaryOperatorTypeOfNode",
    /**
     * `+1`
     * 中`+`
     */
    UnaryOperatorPlusNode = "UnaryOperatorPlusNode",
    /**
     * `-1`
     * 中`-`
     */
    UnaryOperatorMinusNode = "UnaryOperatorMinusNode",
    /**
     * delete
     */
    UnaryOperatorDeleteNode = "UnaryOperatorDeleteNode",
    /**
     * try{
     * }catch(e){
     * }
     */
    TryNode = "TryNode",
    /**
     * try{
     * }catch(e){
     * }
     */
    CatchNode = "CatchNode",
    /**
     * 结束部分
     * TerminalNode(DefaultID) default:
     * TerminalNode(ElseID)  else {}
     * TerminalNode(FinallyID) finally {}
     */
    TerminalNode = "TerminalNode",

    /**
     * ```
     * FunctionCallNode(FunctionCallID) "" 57:12 loc: 1847-1860 abs: 1847-1860 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *   MemberAccessExpressionNode(MemberAccessExpressionID) "." 57:12 loc: 1847-1858 abs: 1847-1858 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *     IdentifierNode(IdentifierID) "eff" 57:12 loc: 1847-1850 abs: 1847-1850 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *     IdentifierNode(IdentifierID) "destroy" 57:16 loc: 1851-1858 abs: 1851-1858 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *   ContainerNode(ContainerID) SYNTHESIZED 57:23 loc: 1858-1860 abs: 1858-1860 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     * ```
     * eff.destory()
     * 
     * 
     * ```
     * FunctionCallNode(FunctionCallID) "" 63:13 loc: 1962-2026 abs: 1962-2026 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *   MemberAccessExpressionNode(MemberAccessExpressionID) "." 63:13 loc: 1962-1983 abs: 1962-1983 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *     IdentifierNode(IdentifierID) "SysSetData" 63:13 loc: 1962-1972 abs: 1962-1972 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *     IdentifierNode(IdentifierID) "GetBoolCfg" 63:24 loc: 1973-1983 abs: 1973-1983 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *   ContainerNode(ContainerID) SYNTHESIZED 63:34 loc: 1983-2026 abs: 1983-2026 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *     MemberAccessExpressionNode(MemberAccessExpressionID) "." 63:35 loc: 1984-2025 abs: 1984-2025 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *       IdentifierNode(IdentifierID) "EnumSysConfig" 63:35 loc: 1984-1997 abs: 1984-1997 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsExt.as
     *       IdentifierNode(IdentifierID) "BOOL_BLOCK_FIRSTINSCRIPTION" 63:49 loc: 1998-2025 abs: 1998-2025 D:\workspace\wallan2022\sjcq\game\src\com\game\role\skill\panel\SkillInsEx
     * ```
     * SysSetData.GetBoolCfg(EnumSysConfig.BOOL_BLOCK_FIRSTINSCRIPTION)
     */
    FunctionCallNode = "FunctionCallNode",
    /**
     * break
     * continue
     * goto
     */
    IterationFlowNode = "IterationFlowNode",
    LabeledStatementNode = "LabeledStatementNode",

    /**
     * @see NodeID.ForLoopID
     * @see NodeID.ForEachLoopID
     */
    ForLoopNode = "ForLoopNode",
    /**
     * while(){}
     */
    WhileLoopNode = "WhileLoopNode",
    DoWhileLoopNode = "DoWhileLoopNode",
}

const enum NodeID {
    /**
     * @see NodeName.TerminalNode  
     * finally
     */
    FinallyID = "FinallyID",
    /**
     * @see NodeName.TerminalNode  
     * else
     */
    ElseID = "ElseID",
    /**
     * @see NodeName.TerminalNode
     * default
     */
    DefaultID = "DefaultID",

    /**
     * @see NodeName.IterationFlowNode  
     * break
     */
    BreakID = "BreakID",
    /**
     * @see NodeName.IterationFlowNode  
     * continue
     */
    ContinueID = "ContinueID",
    /**
     * @see NodeName.IterationFlowNode  
     * goto  
     * js没对应语法  
     * 一般as3项目也用不到  
     */
    GotoID = "GotoID",

    /**
     * @see NodeName.KeywordNode
     * extends
     */
    KeywordExtendsID = "KeywordExtendsID",
    /**
     * @see NodeName.KeywordNode
     * implements
     */
    KeywordImplementsID = "KeywordImplementsID",
    /**
     * @see NodeName.KeywordNode
     * class
     */
    KeywordClassID = "KeywordClassID",
    /**
     * @see NodeName.ForLoopNode
     * ```as3
     * for (var i:int = 0; i < arr.length; i++) {}
     * for(var key:String in filesListObj){}
     * ```
     */
    ForLoopID = "ForLoopID",
    /**
     * @see NodeName.ForLoopNode
     * ```as3
     * for each(var v:Sprite in _panList){}
     * ```
     */
    ForEachLoopID = "ForEachLoopID",
}



type ClassDict = { [key: string]: AstNode };