import { SfdkClient } from "./sfdk";

export async function listDevices(sfdk: SfdkClient): Promise<string[]> {
  const output = await sfdk.run(["device", "list"]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^#\d+\s+"(.+)"$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1])
    .filter((name) => name.length > 0);
}
