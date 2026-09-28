import * as vscode from "vscode";
import { commitEngineField, ENGINE_FORM_ID, loadEngineForm } from "../forms/engine";
import { FormPanel } from "../forms/formPanel";
import { loadWorkflowForm, saveWorkflowForm, WORKFLOW_FORM_ID } from "../forms/workflow";
import {
  getBuildEngineStatus,
  startBuildEngine,
  stopBuildEngine
} from "../sfdk/engine";
import { SfdkClient } from "../sfdk/sfdk";
import { requireWorkspaceFolder } from "../workspaceConfig";
import { ProjectWorkflow } from "../workflow";
import { TREE_VIEW_IDS } from "./views";

type WorkflowAction =
  | "build"
  | "buildClean"
  | "compiledb"
  | "deploy"
  | "undeploy"
  | "run"
  | "runQmlLive"
  | "startQmlLive"
  | "buildAndRun"
  | "check"
  | "debug"
  | "debugAttach"
  | "debugLoadCore"
  | "init";

type WorkflowGroup = "build" | "run" | "debug";

const WORKFLOW_GROUPS: Record<WorkflowGroup, { label: string; icon: string }> = {
  build: { label: "Build", icon: "tools" },
  run: { label: "Run", icon: "play" },
  debug: { label: "Debug", icon: "debug" }
};

type WorkflowNode =
  | { kind: "group"; group: WorkflowGroup }
  | { kind: "engine" }
  | { kind: "action"; action: WorkflowAction }
  | { kind: "settings" };

export class WorkflowTreeProvider
  implements vscode.TreeDataProvider<WorkflowNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<WorkflowNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private engineRunning = false;
  private readonly workflow: ProjectWorkflow;

  constructor(
    private readonly sfdk: SfdkClient,
    private readonly forms: FormPanel
  ) {
    this.workflow = new ProjectWorkflow(sfdk);
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(element: WorkflowNode): vscode.TreeItem {
    if (element.kind === "group") {
      const group = WORKFLOW_GROUPS[element.group];
      const item = new vscode.TreeItem(group.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `group:${element.group}`;
      item.contextValue = "workflowGroup";
      item.iconPath = new vscode.ThemeIcon(group.icon);
      return item;
    }

    if (element.kind === "engine") {
      const item = new vscode.TreeItem("Build Engine", vscode.TreeItemCollapsibleState.None);
      item.id = "engine";
      item.contextValue = "engine";
      item.description = this.engineRunning ? "running" : "stopped";
      item.iconPath = new vscode.ThemeIcon(this.engineRunning ? "play-circle" : "circle-slash");
      return item;
    }

    if (element.kind === "settings") {
      const item = new vscode.TreeItem("Workflow Settings", vscode.TreeItemCollapsibleState.None);
      item.id = "settings";
      item.contextValue = "workflowAction";
      item.iconPath = new vscode.ThemeIcon("settings-gear");
      item.command = {
        command: "sfosToolkit.openWorkflowSettings",
        title: "Workflow Settings"
      };
      return item;
    }

    const mapping: Record<WorkflowAction, { label: string; command: string; icon: string }> = {
      build: { label: "Build", command: "sfosToolkit.buildDefault", icon: "tools" },
      buildClean: { label: "Clean Build", command: "sfosToolkit.buildClean", icon: "clear-all" },
      compiledb: {
        label: "Generate compile_commands.json",
        command: "sfosToolkit.compiledb",
        icon: "file-code"
      },
      deploy: { label: "Deploy", command: "sfosToolkit.deployDefault", icon: "rocket" },
      undeploy: { label: "Undeploy", command: "sfosToolkit.undeployDefault", icon: "trash" },
      run: { label: "Run", command: "sfosToolkit.runDefault", icon: "play" },
      runQmlLive: {
        label: "Run with QmlLive",
        command: "sfosToolkit.runWithQmlLive",
        icon: "remote"
      },
      startQmlLive: {
        label: "Start QmlLive Bench",
        command: "sfosToolkit.startQmlLiveBench",
        icon: "radio-tower"
      },
      buildAndRun: {
        label: "Build, Deploy and Run",
        command: "sfosToolkit.buildAndRun",
        icon: "run-all"
      },
      check: { label: "Check", command: "sfosToolkit.check", icon: "verified" },
      debug: { label: "Debug", command: "sfosToolkit.debugDefault", icon: "debug" },
      debugAttach: {
        label: "Debug Attach...",
        command: "sfosToolkit.debugAttach",
        icon: "debug-alt"
      },
      debugLoadCore: {
        label: "Debug Load Core...",
        command: "sfosToolkit.debugLoadCore",
        icon: "file-binary"
      },
      init: { label: "Initialize Project", command: "sfosToolkit.init", icon: "new-file" }
    };
    const descriptor = mapping[element.action];
    const item = new vscode.TreeItem(descriptor.label, vscode.TreeItemCollapsibleState.None);
    item.id = `action:${element.action}`;
    item.contextValue = "workflowAction";
    item.iconPath = new vscode.ThemeIcon(descriptor.icon);
    item.command = { command: descriptor.command, title: descriptor.label };
    return item;
  }

  getChildren(element?: WorkflowNode): WorkflowNode[] {
    if (!element) {
      return [
        { kind: "group", group: "build" },
        { kind: "group", group: "run" },
        { kind: "group", group: "debug" },
        { kind: "settings" }
      ];
    }

    if (element.kind === "group" && element.group === "build") {
      return [
        { kind: "engine" },
        { kind: "action", action: "build" },
        { kind: "action", action: "buildClean" },
        { kind: "action", action: "compiledb" },
        { kind: "action", action: "check" },
        { kind: "action", action: "init" }
      ];
    }

    if (element.kind === "group" && element.group === "run") {
      return [
        { kind: "action", action: "deploy" },
        { kind: "action", action: "undeploy" },
        { kind: "action", action: "run" },
        { kind: "action", action: "runQmlLive" },
        { kind: "action", action: "startQmlLive" },
        { kind: "action", action: "buildAndRun" }
      ];
    }

    if (element.kind === "group" && element.group === "debug") {
      return [
        { kind: "action", action: "debug" },
        { kind: "action", action: "debugAttach" },
        { kind: "action", action: "debugLoadCore" }
      ];
    }

    return [];
  }

  async refresh(): Promise<void> {
    await vscode.window.withProgress(
      {
        location: { viewId: TREE_VIEW_IDS.workflow },
        title: "Refreshing workflow"
      },
      async () => {
        try {
          this.engineRunning = (await getBuildEngineStatus(this.sfdk)) === true;
          this.updateEngineContext();
          this.onDidChangeTreeDataEmitter.fire(undefined);
          await this.forms.refresh(ENGINE_FORM_ID);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(message);
        }
      }
    );
  }

  async startEngine(): Promise<void> {
    if (this.engineRunning) {
      return;
    }
    await this.withProgress("Starting build engine", async () => {
      await startBuildEngine(this.sfdk);
      this.engineRunning = true;
      this.updateEngineContext();
      this.onDidChangeTreeDataEmitter.fire(undefined);
      await this.forms.refresh(ENGINE_FORM_ID);
    });
  }

  async stopEngine(): Promise<void> {
    if (!this.engineRunning) {
      return;
    }
    await this.withProgress("Stopping build engine", async () => {
      await stopBuildEngine(this.sfdk);
      this.engineRunning = false;
      this.updateEngineContext();
      this.onDidChangeTreeDataEmitter.fire(undefined);
      await this.forms.refresh(ENGINE_FORM_ID);
    });
  }

  async openEngineConfig(): Promise<void> {
    await this.forms.open(ENGINE_FORM_ID, "Build Engine", {
      load: () => loadEngineForm(this.sfdk, this.engineRunning),
      commitField: (key, value) => commitEngineField(this.sfdk, this.engineRunning, key, value)
    });
  }

  openEngineTerminal(): void {
    let cwd: string;
    try {
      cwd = this.sfdk.workingDirectory();
    } catch {
      return;
    }
    const terminal = vscode.window.createTerminal({
      name: "Build Engine",
      cwd,
      message: "Interactive shell for build engine"
    });
    terminal.show();
    terminal.sendText(`${this.sfdk.commandPath()} engine exec -t`);
  }

  async openSettings(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    await this.forms.open(WORKFLOW_FORM_ID, "Build / Deploy / Run Settings", {
      load: () => loadWorkflowForm(folder),
      commitAll: async (values) => {
        await saveWorkflowForm(folder, values);
        void vscode.window.showInformationMessage("Workflow settings saved.");
      }
    });
  }

  buildDefault(): Promise<void> {
    return this.runAction("Building", () => this.workflow.buildDefault());
  }

  buildCleanDefault(): Promise<void> {
    return this.runAction("Clean building", () => this.workflow.buildCleanDefault());
  }

  compiledb(): Promise<void> {
    return this.runAction("Generating compile_commands.json", () => this.workflow.compiledb());
  }

  async buildWithTargetPrompt(): Promise<void> {
    try {
      const target = await this.workflow.promptBuildTarget();
      if (!target) {
        return;
      }
      await this.runAction("Building", () => this.workflow.buildForTarget(target));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  deployDefault(): Promise<void> {
    return this.runAction("Deploying", () => this.workflow.deployDefault());
  }

  async undeployDefault(): Promise<void> {
    try {
      const confirmed = await this.workflow.confirmUndeploy();
      if (!confirmed) {
        return;
      }
      await this.runAction("Undeploying", () => this.workflow.undeployDefault());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  async deployWithDevicePrompt(): Promise<void> {
    try {
      const device = await this.workflow.promptDeployDevice();
      if (!device) {
        return;
      }
      await this.runAction("Deploying", () => this.workflow.deployToDevice(device));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  runDefault(): Promise<void> {
    return this.runAction("Running", () => this.workflow.runDefault());
  }

  async runWithQmlLive(): Promise<void> {
    try {
      await this.workflow.runWithQmlLive();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  startQmlLiveBench(): void {
    this.workflow.startQmlLiveBench();
  }

  buildAndRunDefault(): Promise<void> {
    return this.runAction("Build, deploy and run", () => this.workflow.buildAndRunDefault());
  }

  check(): Promise<void> {
    return this.runAction("Checking", () => this.workflow.check());
  }

  debugDefault(): Promise<void> {
    return this.workflow.debugDefault();
  }

  debugAttach(): Promise<void> {
    return this.workflow.debugAttach();
  }

  debugLoadCore(): Promise<void> {
    return this.workflow.debugLoadCore();
  }

  async init(): Promise<void> {
    try {
      const spec = await this.workflow.promptInit();
      if (!spec) {
        return;
      }
      await this.runAction("Initializing project", () => this.workflow.initProject(spec));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  private updateEngineContext(): void {
    void vscode.commands.executeCommand("setContext", "sfosToolkit.engineRunning", this.engineRunning);
  }

  private async runAction(title: string, work: () => Promise<void>): Promise<void> {
    await this.withProgress(title, work);
  }

  private async withProgress(title: string, work: () => Promise<void>): Promise<void> {
    await vscode.window.withProgress(
      {
        location: { viewId: TREE_VIEW_IDS.workflow },
        title
      },
      async () => {
        try {
          await work();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(message);
        }
      }
    );
  }
}
