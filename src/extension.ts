import { spawn } from "child_process";
import * as vscode from "vscode";
import { FormPanel } from "./forms/formPanel";
import { SfdkClient } from "./sfdk/sfdk";
import { DevicesTreeProvider } from "./views/devices";
import { EmulatorsTreeProvider } from "./views/emulators";
import { TargetsTreeProvider } from "./views/targets";
import { TREE_VIEW_IDS } from "./views/views";
import { WorkflowTreeProvider } from "./views/workflow";

export function activate(context: vscode.ExtensionContext): void {
  const sfdk = new SfdkClient();
  const forms = new FormPanel(context);
  const workflowTree = new WorkflowTreeProvider(sfdk, forms);
  const targetsTree = new TargetsTreeProvider(sfdk);
  const devicesTree = new DevicesTreeProvider(sfdk);
  const emulatorsTree = new EmulatorsTreeProvider(sfdk, forms);

  context.subscriptions.push(
    forms,
    workflowTree,
    targetsTree,
    devicesTree,
    emulatorsTree,
    vscode.window.registerTreeDataProvider(TREE_VIEW_IDS.workflow, workflowTree),
    vscode.window.registerTreeDataProvider(TREE_VIEW_IDS.targets, targetsTree),
    vscode.window.registerTreeDataProvider(TREE_VIEW_IDS.devices, devicesTree),
    vscode.window.registerTreeDataProvider(TREE_VIEW_IDS.emulators, emulatorsTree),
    vscode.commands.registerCommand("sfosToolkit.tree.refreshEmulators", () =>
      emulatorsTree.refresh()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.startEmulator", (node) =>
      emulatorsTree.start(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.stopEmulator", (node) =>
      emulatorsTree.stop(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.restartEmulator", (node) =>
      emulatorsTree.restart(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.createEmulator", () =>
      emulatorsTree.create()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.removeEmulator", (node) =>
      emulatorsTree.remove(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.openEmulatorConfig", (node) =>
      emulatorsTree.openConfig(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.openEmulatorTerminal", (node) =>
      emulatorsTree.openTerminal(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.refreshDevices", () =>
      devicesTree.refresh()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.setDefaultDevice", (node) =>
      devicesTree.setDefault(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.openDeviceTerminal", (node) =>
      devicesTree.openTerminal(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.refreshTargets", () =>
      targetsTree.refresh()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.createTarget", () => targetsTree.create()),
    vscode.commands.registerCommand("sfosToolkit.tree.setDefaultTarget", (node) =>
      targetsTree.setDefault(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.openTargetTerminal", (node) =>
      targetsTree.openTerminal(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.removeTarget", (node) =>
      targetsTree.remove(node)
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.refreshWorkflow", () =>
      workflowTree.refresh()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.startBuildEngine", () =>
      workflowTree.startEngine()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.stopBuildEngine", () =>
      workflowTree.stopEngine()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.openEngineConfig", () =>
      workflowTree.openEngineConfig()
    ),
    vscode.commands.registerCommand("sfosToolkit.tree.openEngineTerminal", () =>
      workflowTree.openEngineTerminal()
    ),
    vscode.commands.registerCommand("sfosToolkit.buildDefault", () => workflowTree.buildDefault()),
    vscode.commands.registerCommand("sfosToolkit.buildClean", () => workflowTree.buildCleanDefault()),
    vscode.commands.registerCommand("sfosToolkit.buildSelectTarget", () =>
      workflowTree.buildWithTargetPrompt()
    ),
    vscode.commands.registerCommand("sfosToolkit.compiledb", () => workflowTree.compiledb()),
    vscode.commands.registerCommand("sfosToolkit.deployDefault", () => workflowTree.deployDefault()),
    vscode.commands.registerCommand("sfosToolkit.deploySelectDevice", () =>
      workflowTree.deployWithDevicePrompt()
    ),
    vscode.commands.registerCommand("sfosToolkit.undeployDefault", () =>
      workflowTree.undeployDefault()
    ),
    vscode.commands.registerCommand("sfosToolkit.runDefault", () => workflowTree.runDefault()),
    vscode.commands.registerCommand("sfosToolkit.runWithQmlLive", () =>
      workflowTree.runWithQmlLive()
    ),
    vscode.commands.registerCommand("sfosToolkit.startQmlLiveBench", () =>
      workflowTree.startQmlLiveBench()
    ),
    vscode.commands.registerCommand("sfosToolkit.buildAndRun", () =>
      workflowTree.buildAndRunDefault()
    ),
    vscode.commands.registerCommand("sfosToolkit.check", () => workflowTree.check()),
    vscode.commands.registerCommand("sfosToolkit.debugDefault", () => workflowTree.debugDefault()),
    vscode.commands.registerCommand("sfosToolkit.debugAttach", () => workflowTree.debugAttach()),
    vscode.commands.registerCommand("sfosToolkit.debugLoadCore", () => workflowTree.debugLoadCore()),
    vscode.commands.registerCommand("sfosToolkit.init", () => workflowTree.init()),
    vscode.commands.registerCommand("sfosToolkit.openWorkflowSettings", () =>
      workflowTree.openSettings()
    ),
    vscode.commands.registerCommand("sfosToolkit.showOutput", () => sfdk.showOutput()),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme !== "file" || !document.uri.fsPath.endsWith(".qml")) {
        return;
      }
      spawn("touch", ["-c", document.uri.fsPath], { stdio: "ignore" }).unref();
    })
  );

  void emulatorsTree.refresh();
  void devicesTree.refresh();
  void targetsTree.refresh();
  void workflowTree.refresh();
}

export function deactivate(): void {}
