import * as vscode from "vscode";
import { listDevices } from "../sfdk/devices";
import { SfdkClient } from "../sfdk/sfdk";
import { getWorkspaceConfig, setWorkspaceConfig } from "../workspaceConfig";
import { TREE_VIEW_IDS } from "./views";

export type DeviceNode = {
  name: string;
};

export class DevicesTreeProvider
  implements vscode.TreeDataProvider<DeviceNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<DeviceNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private devices: DeviceNode[] = [];
  private defaultDevice: string | null = null;

  constructor(private readonly sfdk: SfdkClient) {}

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(element: DeviceNode): vscode.TreeItem {
    const isDefault = this.defaultDevice === element.name;
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    item.id = `device:${element.name}`;
    item.contextValue = "device";
    item.description = isDefault ? "selected" : "";
    item.iconPath = new vscode.ThemeIcon("device-mobile");
    item.command = {
      command: "sfosToolkit.tree.setDefaultDevice",
      title: "Set Selected Device",
      arguments: [element]
    };
    return item;
  }

  getChildren(): DeviceNode[] {
    return this.devices;
  }

  async refresh(): Promise<void> {
    await vscode.window.withProgress(
      {
        location: { viewId: TREE_VIEW_IDS.devices },
        title: "Refreshing devices"
      },
      async () => {
        try {
          this.devices = (await listDevices(this.sfdk)).map((name) => ({ name }));
          this.defaultDevice = getWorkspaceConfig("defaultDevice");
          const names = this.devices.map((device) => device.name);
          if (names.length > 0 && (!this.defaultDevice || !names.includes(this.defaultDevice))) {
            this.defaultDevice = names[0];
            await setWorkspaceConfig("defaultDevice", this.defaultDevice);
          }
          this.onDidChangeTreeDataEmitter.fire(undefined);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(message);
        }
      }
    );
  }

  async setDefault(node: DeviceNode | undefined): Promise<void> {
    if (!node) {
      return;
    }

    await setWorkspaceConfig("defaultDevice", node.name);
    this.defaultDevice = node.name;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    void vscode.window.showInformationMessage(`Selected device set to ${node.name}.`);
  }

  openTerminal(node: DeviceNode | undefined): void {
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
      name: `Device: ${node.name}`,
      cwd,
      message: `Interactive shell for device: ${node.name}`
    });
    terminal.show();
    terminal.sendText(`${this.sfdk.commandPath()} device exec "${node.name}" -t`);
  }
}
