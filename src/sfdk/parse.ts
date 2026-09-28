export function parseKeyValueOutput(output: string): Record<string, string> {
  const details: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(.+?):\s*(.+)$/);
    if (!match) {
      continue;
    }
    const key = match[1]
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_.]/g, "");
    details[key] = match[2];
  }
  return details;
}
