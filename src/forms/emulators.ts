import {
  getEmulatorDetails,
  listEmulatorDeviceModels,
  setEmulatorProperty
} from "../sfdk/emulators";
import { SfdkClient } from "../sfdk/sfdk";
import { FormDocument, FormField } from "./types";

export function emulatorFormId(name: string): string {
  return `emulator:${name}`;
}

export async function loadEmulatorForm(
  sfdk: SfdkClient,
  name: string,
  running: boolean
): Promise<FormDocument> {
  const details = await getEmulatorDetails(sfdk, name);
  const models = await listEmulatorDeviceModels(sfdk).catch(() => [] as string[]);

  return {
    id: emulatorFormId(name),
    title: `Emulator: ${name}`,
    status: running
      ? "Emulator is running. Stop emulator to edit settings."
      : "Emulator is stopped. Settings can be edited.",
    readonly: running,
    commit: "field",
    fields: Object.keys(details)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => fieldFor(key, details[key], models))
  };
}

export async function commitEmulatorField(
  sfdk: SfdkClient,
  name: string,
  running: boolean,
  key: string,
  value: string
): Promise<void> {
  if (running) {
    throw new Error("Stop emulator before changing emulator configuration.");
  }

  await setEmulatorProperty(sfdk, name, key, normalizeValue(key, value));
}

function fieldFor(key: string, value: string, models: string[]): FormField {
  const trimmed = value.trim();

  if (key === "orientation") {
    return selectField(key, normalizeValue(key, trimmed), [
      { value: "portrait", label: "portrait" },
      { value: "landscape", label: "landscape" }
    ]);
  }

  if (key === "downscale") {
    return selectField(key, normalizeValue(key, trimmed), [
      { value: "yes", label: "yes" },
      { value: "no", label: "no" }
    ]);
  }

  if (key === "device-model") {
    const options = models.map((model) => ({ value: model, label: model }));
    if (trimmed && !models.includes(trimmed)) {
      options.unshift({ value: trimmed, label: trimmed });
    }
    return selectField(key, trimmed, options);
  }

  if (/^(vm\.|.*\.port$|.*\.timeout$)/.test(key)) {
    return { key, label: key, type: "number", value: trimmed };
  }

  return { key, label: key, type: "text", value: trimmed };
}

function selectField(
  key: string,
  value: string,
  options: Array<{ value: string; label: string }>
): FormField {
  return { key, label: key, type: "select", value, options };
}

function normalizeValue(key: string, value: string): string {
  const trimmed = value.trim();
  if (key === "orientation") {
    return trimmed.toLowerCase() === "landscape" ? "landscape" : "portrait";
  }
  if (key === "downscale") {
    return trimmed.toLowerCase() === "yes" ? "yes" : "no";
  }
  return trimmed;
}
