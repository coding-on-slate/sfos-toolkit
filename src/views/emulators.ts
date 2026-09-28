import * as vscode from "vscode";
import { commitEmulatorField, emulatorFormId, loadEmulatorForm } from "../forms/emulators";
import { FormPanel } from "../forms/formPanel";
import {
  getEmulatorStatus,
  installEmulator,
  listAvailableEmulators,
  listEmulators,
  removeEmulator,
  startEmulator,
  stopEmulator
} from "../sfdk/emulators";
import { SfdkClient } from "../sfdk/sfdk";
import { TREE_VIEW_IDS } from "./views";

export type EmulatorNode = {
  name: string;
  running: boolean | null;
};

export class EmulatorsTreeProvider
  implements vscode.TreeDataProvider<EmulatorNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    EmulatorNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private emulators: EmulatorNode[] = [];

  constructor(
    private readonly sfdk: SfdkClient,
    private readonly forms: FormPanel
  ) {}

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(element: EmulatorNode): vscode.TreeItem {
    const running = element.running === true;
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    item.id = `emulator:${element.name}`;
    item.contextValue = running ? "emulatorRunning" : "emulatorStopped";
    item.description = running ? "running" : "stopped";
    item.iconPath = new vscode.ThemeIcon(running ? "vm-running" : "vm");
    item.tooltip = running
      ? `Emulator ${element.name} is running.`
      : `Emulator ${element.name} is stopped.`;
    return item;
  }

  getChildren(): EmulatorNode[] {
    return this.emulators;
  }

  async refresh(): Promise<void> {
    await this.withProgress("Refreshing emulators", async () => {
      const names = await listEmulators(this.sfdk);
      const next: EmulatorNode[] = [];
      for (const name of names) {
        const running = await getEmulatorStatus(this.sfdk, name).catch(() => null);
        next.push({ name, running });
      }
      this.emulators = next;
      this.onDidChangeTreeDataEmitter.fire(undefined);
    });
  }

  async start(node: EmulatorNode | undefined): Promise<void> {
    if (!node || node.running === true) {
      return;
    }

    await this.withProgress("Starting emulator", async () => {
      await startEmulator(this.sfdk, node.name);
      this.setRunning(node.name, true);
    });
  }

  async stop(node: EmulatorNode | undefined): Promise<void> {
    if (!node || node.running === false) {
      return;
    }

    await this.withProgress("Stopping emulator", async () => {
      await stopEmulator(this.sfdk, node.name);
      this.setRunning(node.name, false);
    });
  }

  async restart(node: EmulatorNode | undefined): Promise<void> {
    if (!node) {
      return;
    }

    await this.withProgress("Restarting emulator", async () => {
      if (node.running === true) {
        await stopEmulator(this.sfdk, node.name);
      }
      await startEmulator(this.sfdk, node.name);
      this.setRunning(node.name, true);
    });
  }

  async create(): Promise<void> {
    const entries = await this.withProgress("Loading available emulators", () =>
      listAvailableEmulators(this.sfdk)
    );
    if (entries === undefined) {
      return;
    }

    const items = entries
      .filter((entry) => /\bavailable\b/i.test(entry.status))
      .map((entry) => ({ label: entry.name, description: entry.status }));

    if (items.length === 0) {
      void vscode.window.showErrorMessage("No available emulators to install.");
      return;
    }

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: "Select emulator to install"
    });
    if (!selection) {
      return;
    }

    const installed = await this.withProgress("Installing emulator", async () => {
      await installEmulator(this.sfdk, selection.label);
      return true;
    });
    if (installed) {
      await this.refresh();
    }
  }

  async remove(node: EmulatorNode | undefined): Promise<void> {
    if (!node) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove emulator "${node.name}"?`,
      { modal: true },
      "Remove"
    );
    if (confirm !== "Remove") {
      return;
    }

    const removed = await this.withProgress("Removing emulator", async () => {
      await removeEmulator(this.sfdk, node.name);
      return true;
    });
    if (removed) {
      this.forms.close(emulatorFormId(node.name));
      await this.refresh();
    }
  }

  openTerminal(node: EmulatorNode | undefined): void {
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
      name: `Emulator: ${node.name}`,
      cwd,
      message: `Interactive shell for emulator: ${node.name}`
    });
    terminal.show();
    terminal.sendText(`${this.sfdk.commandPath()} emulator exec "${node.name}" -t`);
  }

  async openConfig(node: EmulatorNode | undefined): Promise<void> {
    if (!node) {
      return;
    }

    await this.forms.open(emulatorFormId(node.name), `Emulator: ${node.name}`, {
      load: () => loadEmulatorForm(this.sfdk, node.name, this.isRunning(node.name)),
      commitField: (key, value) =>
        commitEmulatorField(this.sfdk, node.name, this.isRunning(node.name), key, value)
    });
  }

  private isRunning(name: string): boolean {
    return this.emulators.find((emulator) => emulator.name === name)?.running === true;
  }

  private setRunning(name: string, running: boolean): void {
    this.emulators = this.emulators.map((emulator) =>
      emulator.name === name ? { ...emulator, running } : emulator
    );
    this.onDidChangeTreeDataEmitter.fire(undefined);
    void this.forms.refresh(emulatorFormId(name));
  }

  private async withProgress<T>(title: string, work: () => Promise<T>): Promise<T | undefined> {
    return vscode.window.withProgress(
      {
        location: { viewId: TREE_VIEW_IDS.emulators },
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
