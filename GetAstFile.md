## Ast文件生成方式
1. 拉取项目 https://github.com/BowlerHatLLC/vscode-as3mxml  
2. 将项目Java编译版本改为`17`  
   修改`pom.xml`
   ```xml
   <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>2.3.2</version>
        <configuration>
          <source>17</source>
          <target>17</target>
        </configuration>
    </plugin>
   ```
3. 将`GetAstFile.java`复制到`language-server\src\main\java\com\as3mxml\vscode\`路径下
4. 修改文件中常量
   flashSDK路径 `FlashSDKPath`  
   项目路径 `ProjectPath`  
   AST文件输出路径 `AstOutputFile`  

## 注意事项  
如果发现运行报错，有可能是使用的`flashSDK`版本不对，无法在SDK根目录找到`flex-config.xml`文件，旧版是放在`frameworks`目录下，只需将该目录下的`flex-config.xml`拷贝至根目录，重新运行程序即可