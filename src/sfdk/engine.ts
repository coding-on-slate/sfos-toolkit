import { parseKeyValueOutput } from "./parse";
import { SfdkClient } from "./sfdk";

export async function getBuildEngineStatus(sfdk: SfdkClient): Promise<boolean | null> {
  const output = await sfdk.run(["engine", "status"]);
  const match = output.toLowerCase().match(/running:\s*(yes|no)/);
  if (!match) {
    return null;
  }
  return match[1] === "yes";
}

export async function startBuildEngine(sfdk: SfdkClient): Promise<void> {
  await sfdk.run(["engine", "start"]);
}

export async function stopBuildEngine(sfdk: SfdkClient): Promise<void> {
  await sfdk.run(["engine", "stop"]);
}

export async function getEngineDetails(sfdk: SfdkClient): Promise<Record<string, string>> {
  const output = await sfdk.run(["engine", "show"]);
  return parseKeyValueOutput(output);
}

export async function setEngineProperty(sfdk: SfdkClient, key: string, value: string): Promise<void> {
  await sfdk.run(["engine", "set", `${key}=${value}`]);
}
