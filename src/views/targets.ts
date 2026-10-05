import * as vscode from "vscode";
import {
  installTarget,
  listAvailableTargets,
  listTargets,
  removeTarget
} from "../sfdk/targets";
import { SfdkClient } from "../sfdk/sfdk";
import { getWorkspaceConfig, setWorkspaceConfig } from "../workspaceConfig";
import { TREE_VIEW_IDS } from "./views";

export type TargetNode = {
  name: string;
};

export class TargetsTreeProvider
  implements vscode.TreeDataProvider<TargetNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TargetNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private targets: TargetNode[] = [];
  private defaultTarget: string | null = null;

  constructor(private readonly sfdk: SfdkClient) {}

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(element: TargetNode): vscode.TreeItem {
    const isDefault = this.defaultTarget === element.name;
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    item.id = `target:${element.name}`;
    item.contextValue = "target";
    item.description = isDefault ? "selected" : "";
    item.iconPath = new vscode.ThemeIcon("package");
    item.command = {
      command: "sfosToolkit.tree.setDefaultTarget",
      title: "Set Selected Target",
      arguments: [element]
    };
    return item;
  }

  getChildren(): TargetNode[] {
    return this.targets;
  }

  async refresh(): Promise<void> {
    await this.withProgress("Refreshing targets", async () => {
      this.targets = (await listTargets(this.sfdk)).map((name) => ({ name }));
      this.defaultTarget = getWorkspaceConfig("defaultTarget");
      const names = this.targets.map((target) => target.name);
      if (names.length > 0 && (!this.defaultTarget || !names.includes(this.defaultTarget))) {
        this.defaultTarget = names[0];
        await setWorkspaceConfig("defaultTarget", this.defaultTarget);
      }
      this.onDidChangeTreeDataEmitter.fire(undefined);
    });
  }

  async setDefault(node: TargetNode | undefined): Promise<void> {
    if (!node) {
      return;
    }

    await setWorkspaceConfig("defaultTarget", node.name);
    this.defaultTarget = node.name;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    void vscode.window.showInformationMessage(`Selected target set to ${node.name}.`);
  }

  async create(): Promise<void> {
    const entries = await this.withProgress("Loading available targets", () =>
      listAvailableTargets(this.sfdk)
    );
    if (entries === undefined) {
      return;
    }

    const items = entries
      .filter((entry) => !/\binstalled\b/i.test(entry.status))
      .map((entry) => ({ label: entry.name, description: entry.status }));

    if (items.length === 0) {
      void vscode.window.showErrorMessage("No available targets to install.");
      return;
    }

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: "Select target to install"
    });
    if (!selection) {
      return;
    }

    const installed = await this.withProgress("Installing target", async () => {
      await installTarget(this.sfdk, selection.label);
      return true;
    });
    if (installed) {
      await this.refresh();
    }
  }

  async remove(node: TargetNode | undefined): Promise<void> {
    if (!node) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove target "${node.name}"?`,
      { modal: true },
      "Remove"
    );
    if (confirm !== "Remove") {
      return;
    }

    const removed = await this.withProgress("Removing target", async () => {
      await removeTarget(this.sfdk, node.name);
      return true;
    });
    if (!removed) {
      return;
    }

    if (this.defaultTarget === node.name) {
      await setWorkspaceConfig("defaultTarget", null);
      this.defaultTarget = null;
    }

    await this.refresh();
  }

  openTerminal(node: TargetNode | undefined): void {
    if (!node) {
      return;
    }

    let cwd: string;
    try {
      cwd = this.sfdk.workingDirectory();
    } catch {
      return;
    }

    const terminal = vscode.window.createTerminal({
      name: `Target: ${node.name}`,
      cwd,
      message: `Interactive shell for target: ${node.name}`
    });
    terminal.show();
    terminal.sendText(`${this.sfdk.commandPath()} tools exec "${node.name}"`);
  }

  private async withProgress<T>(title: string, work: () => Promise<T>): Promise<T | undefined> {
    return vscode.window.withProgress(
      {
        location: { viewId: TREE_VIEW_IDS.targets },
        title
      },
      async () => {
        try {
          return await work();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(message);
          return undefined;
        }
      }
    );
  }
}
