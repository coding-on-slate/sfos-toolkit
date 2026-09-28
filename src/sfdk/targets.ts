import { SfdkClient } from "./sfdk";

export async function listTargets(sfdk: SfdkClient): Promise<string[]> {
  const output = await sfdk.run(["tools", "target", "list"]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseTargetName(line))
    .filter((name) => name.length > 0);
}

export async function listAvailableTargets(
  sfdk: SfdkClient
): Promise<Array<{ name: string; status: string }>> {
  const output = await sfdk.run(["tools", "target", "list", "-a"]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s{2,}/))
    .map(([name, status]) => ({
      name: (name || "").trim(),
      status: (status || "").trim()
    }))
    .filter((entry) => entry.name.length > 0);
}

export async function installTarget(sfdk: SfdkClient, name: string): Promise<void> {
  await sfdk.run(["tools", "target", "install", name]);
}

export async function removeTarget(sfdk: SfdkClient, name: string): Promise<void> {
  await sfdk.run(["tools", "target", "remove", name]);
}

function parseTargetName(line: string): string {
  const columns = line.split(/\s{2,}/).map((col) => col.trim()).filter(Boolean);
  const primary = columns.length > 0 ? columns[0] : line;

  const quotedIndexed = primary.match(/^#\d+\s+"(.+)"$/);
  if (quotedIndexed) {
    return quotedIndexed[1].trim();
  }

  const quoted = primary.match(/^"(.+)"$/);
  if (quoted) {
    return quoted[1].trim();
  }

  const indexed = primary.match(/^#\d+\s+(.+)$/);
  if (indexed) {
    return indexed[1].trim();
  }

  return primary;
}
