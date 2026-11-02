import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

export function getWorkspaceConfig(key: string): string | null {
  const folder = workspaceFolder();
  if (!folder) {
    return null;
  }
  const value =
    vscode.workspace.getConfiguration("sfosToolkit", folder.uri).get<string>(key, "")?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export async function setWorkspaceConfig(key: string, value: string | null): Promise<void> {
  const folder = workspaceFolder();
  if (!folder) {
    return;
  }
  await vscode.workspace
    .getConfiguration("sfosToolkit", folder.uri)
    .update(key, value ?? "", vscode.ConfigurationTarget.WorkspaceFolder);
}

/** Persist a default only if this folder is a Sailfish project or already has workspace settings. */
export async function persistWorkspaceDefault(key: string, value: string): Promise<void> {
  const folder = workspaceFolder();
  if (!folder) {
    return;
  }

  const inspected = vscode.workspace.getConfiguration("sfosToolkit", folder.uri).inspect<string>(key);
  const workspaceValue = inspected?.workspaceFolderValue?.trim() ?? "";
  if (workspaceValue === value) {
    return;
  }
  if (!workspaceValue && !(await looksLikeSailfishProject(folder))) {
    return;
  }

  await setWorkspaceConfig(key, value);
}

export async function looksLikeSailfishProject(
  folder: vscode.WorkspaceFolder | undefined = workspaceFolder()
): Promise<boolean> {
  if (!folder) {
    return false;
  }

  const root = folder.uri.fsPath;
  const entries = await fs.readdir(root).catch((): string[] => []);
  if (!entries.includes("rpm") || !entries.includes("qml")) {
    return false;
  }

  if (entries.some((entry) => entry.endsWith(".desktop") || entry.endsWith(".spec"))) {
    return true;
  }

  const rpmEntries = await fs.readdir(path.join(root, "rpm")).catch((): string[] => []);
  return rpmEntries.some((entry) => entry.endsWith(".spec") || entry.endsWith(".desktop"));
}

export function workspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (activeFolder) {
      return activeFolder;
    }
  }
  return vscode.workspace.workspaceFolders?.[0];
}

export function requireWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folder = workspaceFolder();
  if (!folder) {
    void vscode.window.showErrorMessage(
      "Open a workspace folder to use SFOS Toolkit build and deploy commands."
    );
  }
  return folder;
}
