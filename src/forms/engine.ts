import { getEngineDetails, setEngineProperty } from "../sfdk/engine";
import { SfdkClient } from "../sfdk/sfdk";
import { FormDocument, FormField } from "./types";

export const ENGINE_FORM_ID = "engine";

export async function loadEngineForm(sfdk: SfdkClient, running: boolean): Promise<FormDocument> {
  const details = await getEngineDetails(sfdk);

  return {
    id: ENGINE_FORM_ID,
    title: "Build Engine",
    status: running
      ? "Engine is running. Stop engine to edit settings."
      : "Engine is stopped. Settings can be edited.",
    readonly: running,
    commit: "field",
    fields: Object.keys(details)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => fieldFor(key, details[key]))
  };
}

export async function commitEngineField(
  sfdk: SfdkClient,
  running: boolean,
  key: string,
  value: string
): Promise<void> {
  if (running) {
    throw new Error("Stop build engine before changing engine configuration.");
  }

  await setEngineProperty(sfdk, key, value.trim());
}

function fieldFor(key: string, value: string): FormField {
  const trimmed = value.trim();
  if (/^(vm\.|.*\.port$|.*\.timeout$)/.test(key)) {
    return { key, label: key, type: "number", value: trimmed };
  }
  return { key, label: key, type: "text", value: trimmed };
}
