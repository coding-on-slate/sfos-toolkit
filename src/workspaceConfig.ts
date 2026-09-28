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
