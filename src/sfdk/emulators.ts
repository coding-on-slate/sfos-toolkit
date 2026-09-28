import { parseKeyValueOutput } from "./parse";
import { SfdkClient } from "./sfdk";

export async function listEmulators(sfdk: SfdkClient): Promise<string[]> {
  const output = await sfdk.run(["emulator", "list"]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0]);
}

export async function listAvailableEmulators(
  sfdk: SfdkClient
): Promise<Array<{ name: string; status: string }>> {
  const output = await sfdk.run(["emulator", "list", "-a"]);
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

export async function getEmulatorStatus(sfdk: SfdkClient, name: string): Promise<boolean | null> {
  const output = await sfdk.run(["emulator", "status", name]);
  const match = output.toLowerCase().match(/running:\s*(yes|no)/);
  if (!match) {
    return null;
  }
  return match[1] === "yes";
}

export async function startEmulator(sfdk: SfdkClient, name: string): Promise<void> {
  await sfdk.run(["emulator", "start", name]);
}

export async function stopEmulator(sfdk: SfdkClient, name: string): Promise<void> {
  await sfdk.run(["emulator", "stop", name]);
}

export async function installEmulator(sfdk: SfdkClient, name: string): Promise<void> {
  await sfdk.run(["emulator", "install", name]);
}

export async function removeEmulator(sfdk: SfdkClient, name: string): Promise<void> {
  await sfdk.run(["emulator", "remove", name]);
}

export async function getEmulatorDetails(
  sfdk: SfdkClient,
  name: string
): Promise<Record<string, string>> {
  const output = await sfdk.run(["emulator", "show", name]);
  return parseKeyValueOutput(output);
}

export async function listEmulatorDeviceModels(sfdk: SfdkClient): Promise<string[]> {
  const output = await sfdk.run(["emulator", "device-model-list"]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function setEmulatorProperty(
  sfdk: SfdkClient,
  name: string,
  key: string,
  value: string
): Promise<void> {
  await sfdk.run(["emulator", "set", name, "--", `${key}=${value}`]);
}

