import * as vscode from "vscode";
import { desktopLaunchFromProject } from "../desktopLaunch";
import { FormDocument } from "./types";

const DEPLOY_METHODS = ["sdk", "pkcon", "rsync", "zypper", "zypper-dup", "manual"] as const;

export const WORKFLOW_FORM_ID = "workflow";

export async function loadWorkflowForm(folder: vscode.WorkspaceFolder): Promise<FormDocument> {
  const config = vscode.workspace.getConfiguration("sfosToolkit", folder.uri);
  let launchCommand = config.get<string>("run.launchCommand", "")?.trim() ?? "";
  let launchArgs = fromArray(config.get("run.args"));
  if (!launchCommand) {
    const desktop = await desktopLaunchFromProject(folder);
    if (desktop) {
      launchCommand = desktop.launchCommand;
      if (!launchArgs) {
        launchArgs = desktop.args.join("\n");
      }
    }
  }

  return {
    id: WORKFLOW_FORM_ID,
    title: "Build / Deploy / Run Settings",
    commit: "all",
    fields: [
      text("build.buildDirectory", "Build directory", config.get<string>("build.buildDirectory", "")),
      area("build.args", "Build args (one per line)", fromArray(config.get("build.args"))),
      area("build.qmakeArgs", "qmake args (one per line)", fromArray(config.get("build.qmakeArgs"))),
      area("build.cmakeArgs", "cmake args (one per line)", fromArray(config.get("build.cmakeArgs"))),
      area("build.environment", "Build environment (KEY=VALUE per line)", fromMap(config.get("build.environment"))),
      area("build.preSteps", "Pre-build steps (one per line)", fromArray(config.get("build.preSteps"))),
      area("build.postSteps", "Post-build steps (one per line)", fromArray(config.get("build.postSteps"))),
      {
        key: "deploy.method",
        label: "Deploy method",
        type: "select",
        value: normalizeDeployMethod(config.get<string>("deploy.method", "sdk")),
        options: DEPLOY_METHODS.map((value) => ({ value, label: value }))
      },
      area("deploy.args", "Deploy args (one per line)", fromArray(config.get("deploy.args"))),
      area(
        "deploy.environment",
        "Deploy environment (KEY=VALUE per line)",
        fromMap(config.get("deploy.environment"))
      ),
      area("deploy.preSteps", "Pre-deploy steps (one per line)", fromArray(config.get("deploy.preSteps"))),
      area("deploy.postSteps", "Post-deploy steps (one per line)", fromArray(config.get("deploy.postSteps"))),
      text("run.launchCommand", "Launch command", launchCommand),
      area("run.args", "Launch args (one per line)", launchArgs),
      text("run.workingDirectory", "Remote working directory", config.get<string>("run.workingDirectory", "")),
      area("run.environment", "Run environment (KEY=VALUE per line)", fromMap(config.get("run.environment"))),
      area("run.debuggerArgs", "Debugger args (one per line)", fromArray(config.get("run.debuggerArgs")))
    ]
  };
}

export async function saveWorkflowForm(
  folder: vscode.WorkspaceFolder,
  values: Record<string, string>
): Promise<void> {
  const config = vscode.workspace.getConfiguration("sfosToolkit", folder.uri);
  const target = vscode.ConfigurationTarget.WorkspaceFolder;

  await config.update("build.buildDirectory", values["build.buildDirectory"]?.trim() ?? "", target);
  await config.update("build.args", toArray(values["build.args"]), target);
  await config.update("build.qmakeArgs", toArray(values["build.qmakeArgs"]), target);
  await config.update("build.cmakeArgs", toArray(values["build.cmakeArgs"]), target);
  await config.update("build.environment", toMap(values["build.environment"]), target);
  await config.update("build.preSteps", toArray(values["build.preSteps"]), target);
  await config.update("build.postSteps", toArray(values["build.postSteps"]), target);
  await config.update("deploy.method", normalizeDeployMethod(values["deploy.method"]), target);
  await config.update("deploy.args", toArray(values["deploy.args"]), target);
  await config.update("deploy.environment", toMap(values["deploy.environment"]), target);
  await config.update("deploy.preSteps", toArray(values["deploy.preSteps"]), target);
  await config.update("deploy.postSteps", toArray(values["deploy.postSteps"]), target);
  await config.update("run.launchCommand", values["run.launchCommand"]?.trim() ?? "", target);
  await config.update("run.args", toArray(values["run.args"]), target);
  await config.update("run.workingDirectory", values["run.workingDirectory"]?.trim() ?? "", target);
  await config.update("run.environment", toMap(values["run.environment"]), target);
  await config.update("run.debuggerArgs", toArray(values["run.debuggerArgs"]), target);
}

function text(key: string, label: string, value: string | undefined) {
  return { key, label, type: "text" as const, value: value?.trim() ?? "" };
}

function area(key: string, label: string, value: string) {
  return { key, label, type: "textarea" as const, value };
}

function fromArray(value: unknown): string {
  return toStringArray(value).join("\n");
}

function fromMap(value: unknown): string {
  return Object.entries(toStringMap(value))
    .map(([key, entry]) => `${key}=${entry}`)
    .join("\n");
}

function toArray(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toMap(value: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of toArray(value)) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    map[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return map;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
}

function toStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const map: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const trimmed = String(entry ?? "").trim();
    if (key.trim() && trimmed) {
      map[key.trim()] = trimmed;
    }
  }
  return map;
}

function normalizeDeployMethod(value: string | undefined): string {
  const method = (value ?? "sdk").trim();
  return DEPLOY_METHODS.includes(method as (typeof DEPLOY_METHODS)[number]) ? method : "sdk";
}
