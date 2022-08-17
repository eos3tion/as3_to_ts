package com.as3mxml.vscode;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.apache.royale.compiler.internal.testing.NodesToXMLStringFormatter;
import org.apache.royale.compiler.units.ICompilationUnit.UnitType;
import org.eclipse.lsp4j.WorkspaceFolder;

import com.as3mxml.vscode.project.ASConfigProjectConfigStrategy;
import com.as3mxml.vscode.project.IProjectConfigStrategy;
import com.as3mxml.vscode.project.IProjectConfigStrategyFactory;
import com.as3mxml.vscode.utils.ASTUtils;

public class GetAstFile {
    private static final String PROPERTY_FRAMEWORK_LIB = "royalelib";
    private static final String FlashSDKPath = "D:\\workspace\\flashsdk\\AIRSDK_Windows";
    private static final String ProjectPath = "file:///D:/layaAs3Game/";
    private static final String AstOutputFile = "ast.txt";

    public static void main(String[] args) throws IOException {
        var configFactory = new ASConfigProjectConfigStrategyFactory();
        System.setProperty(PROPERTY_FRAMEWORK_LIB, FlashSDKPath);
        var actionScriptServices = new ActionScriptServices(configFactory);
        var folder = new WorkspaceFolder();
        folder.setUri(ProjectPath);
        actionScriptServices.addWorkspaceFolder(folder);
        actionScriptServices.setInitialized();
        var projectData = actionScriptServices.getProjects().get(0);
        var project = projectData.project;
        try (var writer = new PrintWriter(AstOutputFile, StandardCharsets.UTF_8)) {
            for (var unit : project.getCompilationUnits()) {
                if (unit == null) {
                    continue;
                }
                var unitType = unit.getCompilationUnitType();
                if (!UnitType.AS_UNIT.equals(unitType) && !UnitType.MXML_UNIT.equals(unitType)) {
                    // compiled compilation units won't have problems
                    continue;
                }
                var ast = ASTUtils.getCompilationUnitAST(unit);
                if (ast != null) {
                    writer.println(ast.toString());
                }
            }
        }

    }

    private static class ASConfigProjectConfigStrategyFactory implements IProjectConfigStrategyFactory {
        public IProjectConfigStrategy create(Path projectPath, WorkspaceFolder workspaceFolder) {
            return new ASConfigProjectConfigStrategy(projectPath, workspaceFolder);
        }
    }
}
