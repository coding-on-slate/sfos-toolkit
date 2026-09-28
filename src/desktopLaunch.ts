import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

const IGNORED = new Set([".git", ".vscode", "node_modules"]);

export type DesktopLaunch = {
  launchCommand: string;
  args: string[];
};

export async function desktopLaunchFromProject(
  folder: vscode.WorkspaceFolder
): Promise<DesktopLaunch | null> {
  const desktopFile = await findDesktopFile(folder.uri.fsPath);
  if (!desktopFile) {
    return null;
  }

  const contents = await fs.readFile(desktopFile, "utf8");
  const execLine = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("Exec="));
  if (!execLine) {
    return null;
  }

  const tokens = splitCommandLine(execLine.slice("Exec=".length))
    .map((token) => token.replace(/%[fFuUdDnNickvm]/g, "").trim())
    .filter((token) => token.length > 0);

  const launchCommand = tokens[0] ?? "";
  if (!launchCommand) {
    return null;
  }

  return { launchCommand, args: tokens.slice(1) };
}

async function findDesktopFile(root: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findDesktopFile(fullPath);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".desktop")) {
      return fullPath;
    }
  }

  return null;
}

function splitCommandLine(value: string): string[] {
  const matches = value.match(/(?:"[^"]*"|'[^']*'|\\.|[^\s"'])+/g) ?? [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ""));
}
