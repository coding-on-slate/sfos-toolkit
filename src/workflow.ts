import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { desktopLaunchFromProject } from "./desktopLaunch";
import { listDevices } from "./sfdk/devices";
import { SfdkClient } from "./sfdk/sfdk";
import { listTargets } from "./sfdk/targets";
import { getWorkspaceConfig, requireWorkspaceFolder } from "./workspaceConfig";

type DeployMethod = "sdk" | "pkcon" | "rsync" | "zypper" | "zypper-dup" | "manual";

type InitSpec = {
  type: string;
  builder?: string;
  force: boolean;
};

export class ProjectWorkflow {
  constructor(private readonly sfdk: SfdkClient) {}

  async buildDefault(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    await this.build(folder, getWorkspaceConfig("defaultTarget"));
    void vscode.window.showInformationMessage("Build completed.");
  }

  async buildCleanDefault(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    await this.build(folder, getWorkspaceConfig("defaultTarget"), { clean: true });
    void vscode.window.showInformationMessage("Clean build completed.");
  }

  async promptBuildTarget(): Promise<string | undefined> {
    if (!requireWorkspaceFolder()) {
      return undefined;
    }
    return pickPreferredItem(
      "Select build target",
      await listTargets(this.sfdk),
      getWorkspaceConfig("defaultTarget"),
      "Default target"
    );
  }

  async buildForTarget(target: string): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    await this.build(folder, target);
    void vscode.window.showInformationMessage(`Build completed for ${target}.`);
  }

  async deployDefault(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    await this.deploy(
      folder,
      getWorkspaceConfig("defaultDevice"),
      getWorkspaceConfig("defaultTarget")
    );
    void vscode.window.showInformationMessage("Deploy completed.");
  }

  async promptDeployDevice(): Promise<string | undefined> {
    if (!requireWorkspaceFolder()) {
      return undefined;
    }
    return pickPreferredItem(
      "Select deploy device",
      await listDevices(this.sfdk),
      getWorkspaceConfig("defaultDevice"),
      "Default device"
    );
  }

  async deployToDevice(device: string): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    await this.deploy(folder, device, getWorkspaceConfig("defaultTarget"));
    void vscode.window.showInformationMessage(`Deploy completed to ${device}.`);
  }

  async runDefault(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    await this.runOnDevice(folder, getWorkspaceConfig("defaultDevice"));
    void vscode.window.showInformationMessage("Run completed.");
  }

  async buildAndRunDefault(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    const target = getWorkspaceConfig("defaultTarget");
    const device = getWorkspaceConfig("defaultDevice");
    await this.build(folder, target);
    await this.deploy(folder, device, target);
    await this.runOnDevice(folder, device);
    void vscode.window.showInformationMessage("Build, deploy and run completed.");
  }

  async debugDefault(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }

    const run = await readRunSettings(folder);
    if (!run.launchCommand) {
      void vscode.window.showErrorMessage(
        "No launch command found. Set it in Workflow Settings or add an Exec= line in a .desktop file."
      );
      return;
    }

    const args = ["debug", "start"];
    this.appendDebugOptions(args, run);
    if (run.workingDirectory) {
      args.push("--working-directory", run.workingDirectory);
    }
    if (run.args.length > 0) {
      args.push("--args", run.launchCommand, ...run.args);
    } else {
      args.push(run.launchCommand);
    }
    await this.openDebugTerminal(folder, args, "sfdk debug start");
  }

  async debugAttach(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }

    const run = await readRunSettings(folder);
    if (!run.launchCommand) {
      void vscode.window.showErrorMessage(
        "No launch command found. Set it in Workflow Settings or add an Exec= line in a .desktop file."
      );
      return;
    }

    const pid = await vscode.window.showInputBox({
      title: "Attach debugger",
      prompt: "Process ID on the device",
      validateInput: (value) => (/^\d+$/.test(value.trim()) ? undefined : "Enter a numeric PID"),
      ignoreFocusOut: true
    });
    if (!pid) {
      return;
    }

    const args = ["debug", "attach"];
    this.appendDebugOptions(args, run);
    args.push(run.launchCommand, pid.trim());
    await this.openDebugTerminal(folder, args, "sfdk debug attach");
  }

  async debugLoadCore(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }

    const run = await readRunSettings(folder);
    if (!run.launchCommand) {
      void vscode.window.showErrorMessage(
        "No launch command found. Set it in Workflow Settings or add an Exec= line in a .desktop file."
      );
      return;
    }

    const location = await vscode.window.showQuickPick(
      [
        { label: "Core file on this computer", local: true },
        { label: "Core file on the device", local: false }
      ],
      { title: "Load core dump", ignoreFocusOut: true }
    );
    if (!location) {
      return;
    }

    let coreFile: string | undefined;
    if (location.local) {
      const picked = await vscode.window.showOpenDialog({
        title: "Select core dump",
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false
      });
      coreFile = picked?.[0]?.fsPath;
    } else {
      coreFile = await vscode.window.showInputBox({
        title: "Load core dump",
        prompt: "Path to the core file on the device",
        ignoreFocusOut: true
      });
    }
    if (!coreFile?.trim()) {
      return;
    }

    const args = ["debug", "load-core"];
    this.appendDebugOptions(args, run);
    if (location.local) {
      args.push("--local-core");
    }
    args.push(run.launchCommand, coreFile.trim());
    await this.openDebugTerminal(folder, args, "sfdk debug load-core");
  }

  private appendDebugOptions(
    args: string[],
    run: { debuggerArgs: string[] }
  ): void {
    if (run.debuggerArgs.length > 0) {
      args.push("--gdb-args", run.debuggerArgs.join(" "));
    }
  }

  private async openDebugTerminal(
    folder: vscode.WorkspaceFolder,
    args: string[],
    message: string
  ): Promise<void> {
    const { cwd } = await buildContext(folder, readBuildSettings(folder).buildDirectory);
    const device = getWorkspaceConfig("defaultDevice");
    if (!device) {
      void vscode.window.showErrorMessage(
        "No default device set. Choose a device in the Devices view, then try Debug again."
      );
      return;
    }
    const commandArgs: string[] = ["-c", `device=${device}`];
    const target = getWorkspaceConfig("defaultTarget");
    if (target) {
      commandArgs.push("-c", `target=${target}`);
    }
    commandArgs.push(...args);
    const terminal = vscode.window.createTerminal({
      name: "SFOS Debug",
      cwd,
      message
    });
    terminal.show();
    terminal.sendText(
      `${quoteForShell(this.sfdk.commandPath())} ${commandArgs.map(quoteForShell).join(" ")}`
    );
  }

  startQmlLiveBench(): void {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    void this.launchQmlLiveBench(folder).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    });
  }

  async runWithQmlLive(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }

    const run = await readRunSettings(folder);
    if (!run.launchCommand) {
      void vscode.window.showErrorMessage(
        "No launch command found. Set it in Workflow Settings or add an Exec= line in a .desktop file."
      );
      return;
    }

    await this.launchQmlLiveBench(folder);

    const device = getWorkspaceConfig("defaultDevice");
    const live = await qmlLivePaths(folder);
    const args = ["device", "exec"];
    if (device) {
      args.push(device);
    }
    args.push("-t", "--", "sh", "-lc", remoteQmlLiveCommand(run, live.targetWorkspace));

    const terminal = vscode.window.createTerminal({
      name: "SFOS QmlLive",
      cwd: this.sfdk.workingDirectory(),
      message: "App wrapped with qmlliveruntime-sailfish. Connect the host in QmlLive Bench if it stays offline."
    });
    terminal.show();
    terminal.sendText(
      `${quoteForShell(this.sfdk.commandPath())} ${args.map(quoteForShell).join(" ")}`
    );

    const hostName = await qmlLiveRemoteHost(this.sfdk.commandPath(), device);
    if (hostName) {
      setTimeout(() => this.probeQmlLiveHost(hostName.name), 4000);
    }
  }

  private async launchQmlLiveBench(folder: vscode.WorkspaceFolder): Promise<void> {
    const bench = qmlLiveBenchPath(this.sfdk.commandPath());
    const live = await qmlLivePaths(folder);
    const ping = await spawnBench(bench, ["--ping"], 3000);
    if (ping.error?.code === "ENOENT") {
      throw new Error(
        `qmllivebench not found at ${bench}. Install the Sailfish SDK or set sfosToolkit.sfdkPath to the SDK bin/sfdk.`
      );
    }

    await this.registerQmlLiveHost(getWorkspaceConfig("defaultDevice"));

    const benchArgs =
      ping.status === 0 ? ["--remoteonly", live.hostWorkspace] : [live.hostWorkspace];
    const child = spawn(bench, benchArgs, { detached: true, stdio: "ignore" });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        void vscode.window.showErrorMessage(
          `qmllivebench not found at ${bench}. Install the Sailfish SDK or set sfosToolkit.sfdkPath to the SDK bin/sfdk.`
        );
        return;
      }
      void vscode.window.showErrorMessage(`Failed to start QmlLive Bench: ${error.message}`);
    });
    child.unref();
  }

  private async registerQmlLiveHost(device: string | null): Promise<string | null> {
    const host = await qmlLiveRemoteHost(this.sfdk.commandPath(), device);
    if (!host) {
      return null;
    }
    const bench = qmlLiveBenchPath(this.sfdk.commandPath());
    await spawnBench(bench, ["--addhost", host.spec], 5000);
    return host.name;
  }

  private probeQmlLiveHost(hostName: string): void {
    const bench = qmlLiveBenchPath(this.sfdk.commandPath());
    const child = spawn(bench, ["--probehost", hostName], { detached: true, stdio: "ignore" });
    child.unref();
  }

  async compiledb(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    const target = getWorkspaceConfig("defaultTarget");
    const { cwd, projectArg } = await buildContext(folder, readBuildSettings(folder).buildDirectory);
    await this.sfdk.run(
      composeArgs("compiledb", [], projectArg, target ? { target } : undefined),
      { cwd }
    );
    void vscode.window.showInformationMessage(
      "Compilation database generated. clangd can use compile_commands.json."
    );
  }

  async check(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    const target = getWorkspaceConfig("defaultTarget");
    const device = getWorkspaceConfig("defaultDevice");
    const { cwd, projectArg } = await buildContext(folder, readBuildSettings(folder).buildDirectory);
    const config: Record<string, string> = {};
    if (target) {
      config.target = target;
    }
    if (device) {
      config.device = device;
    }
    await this.sfdk.run(composeArgs("check", [], projectArg, config), { cwd });
    void vscode.window.showInformationMessage("Check completed.");
  }

  async confirmUndeploy(): Promise<boolean> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return false;
    }
    const device = getWorkspaceConfig("defaultDevice") ?? "the default device";
    const deployMethod = readDeploySettings(folder).method;
    const method = undeployMethod(deployMethod);
    const mapped =
      method !== deployMethod
        ? ` Undeploy will use --sdk because ${deployMethod} is not a valid undeploy method.`
        : "";
    const choice = await vscode.window.showWarningMessage(
      `Undeploy this project's packages from ${device}?${mapped}`,
      { modal: true },
      "Undeploy"
    );
    return choice === "Undeploy";
  }

  async undeployDefault(): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    const settings = readDeploySettings(folder);
    const build = readBuildSettings(folder);
    const { cwd } = await buildContext(folder, build.buildDirectory);
    const method = undeployMethod(settings.method);
    const config: Record<string, string> = {};
    const device = getWorkspaceConfig("defaultDevice");
    const target = getWorkspaceConfig("defaultTarget");
    if (device) {
      config.device = device;
    }
    if (target) {
      config.target = target;
    }
    await this.sfdk.run(composeArgs("undeploy", [], null, config, [`--${method}`]), { cwd });
    void vscode.window.showInformationMessage("Undeploy completed.");
  }

  async promptInit(): Promise<InitSpec | undefined> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return undefined;
    }

    const initialized = await isProjectInitialized(folder);
    const force = initialized || (await folderNeedsForce(folder));
    if (initialized) {
      const choice = await vscode.window.showWarningMessage(
        "This project is already initialized. Do you really want to continue?",
        { modal: true },
        "Continue"
      );
      if (choice !== "Continue") {
        return undefined;
      }
    } else if (force) {
      const choice = await vscode.window.showWarningMessage(
        "The folder is not empty. Initialize anyway (--force)?",
        { modal: true },
        "Initialize"
      );
      if (choice !== "Initialize") {
        return undefined;
      }
    }

    const output = await this.sfdk.run(["init", "--list-types"]);
    const types = parseInitTypes(output);
    if (types.length === 0) {
      throw new Error(output.trim() || "sfdk init --list-types returned no project types.");
    }

    const typePick = await vscode.window.showQuickPick(
      types.map((entry) => ({
        label: entry.description ? `${entry.name} - ${entry.description}` : entry.name,
        typeName: entry.name
      })),
      { title: "Select project type", ignoreFocusOut: true }
    );
    if (!typePick) {
      return undefined;
    }

    const selected = types.find((entry) => entry.name === typePick.typeName);
    let builder: string | undefined;
    if (selected && selected.builders.length > 1) {
      builder = await vscode.window.showQuickPick(selected.builders, {
        title: "Select builder",
        ignoreFocusOut: true
      });
      if (!builder) {
        return undefined;
      }
    } else if (selected && selected.builders.length === 1) {
      builder = selected.builders[0];
    }

    return { type: typePick.typeName, builder, force };
  }

  async initProject(spec: InitSpec): Promise<void> {
    const folder = requireWorkspaceFolder();
    if (!folder) {
      return;
    }
    const args = ["init", "-t", spec.type];
    if (spec.builder) {
      args.push("-b", spec.builder);
    }
    if (spec.force) {
      args.push("--force");
    }
    await this.sfdk.run(args, { cwd: folder.uri.fsPath });
    void vscode.window.showInformationMessage("Project initialized.");
  }

  private async build(
    folder: vscode.WorkspaceFolder,
    target: string | null,
    options?: { clean?: boolean }
  ): Promise<void> {
    const settings = readBuildSettings(folder);
    const { cwd, projectArg } = await buildContext(folder, settings.buildDirectory);
    const env = settings.environment;
    const config = target ? { target } : undefined;
    const prefixArgs = options?.clean ? ["--clean"] : [];

    await runShellSteps(settings.preSteps, cwd, env);

    if (settings.qmakeArgs.length > 0 && (await hasFileSuffix(folder, ".pro"))) {
      await this.sfdk.run(composeArgs("qmake", settings.qmakeArgs, projectArg, config), { cwd, env });
    }
    if (settings.cmakeArgs.length > 0 && (await pathExists(path.join(folder.uri.fsPath, "CMakeLists.txt")))) {
      await this.sfdk.run(composeArgs("cmake", settings.cmakeArgs, projectArg, config), { cwd, env });
    }

    await this.sfdk.run(composeArgs("build", settings.args, projectArg, config, prefixArgs), { cwd, env });
    await runShellSteps(settings.postSteps, cwd, env);
  }

  private async deploy(
    folder: vscode.WorkspaceFolder,
    device: string | null,
    target: string | null
  ): Promise<void> {
    const settings = readDeploySettings(folder);
    const build = readBuildSettings(folder);
    const { cwd } = await buildContext(folder, build.buildDirectory);
    const config: Record<string, string> = {};
    if (device) {
      config.device = device;
    }
    if (target) {
      config.target = target;
    }

    await runShellSteps(settings.preSteps, cwd, settings.environment);
    await this.sfdk.run(
      composeArgs("deploy", settings.args, null, config, [`--${settings.method}`]),
      { cwd, env: settings.environment }
    );
    await runShellSteps(settings.postSteps, cwd, settings.environment);
  }

  private async runOnDevice(folder: vscode.WorkspaceFolder, device: string | null): Promise<void> {
    const run = await readRunSettings(folder);
    if (!run.launchCommand) {
      throw new Error(
        "No launch command found. Set it in Workflow Settings or add an Exec= line in a .desktop file."
      );
    }

    const args = ["device", "exec"];
    if (device) {
      args.push(device);
    }
    args.push("--", "sh", "-lc", remoteRunCommand(run));
    await this.sfdk.run(args, { cwd: folder.uri.fsPath });
  }
}

function readBuildSettings(folder: vscode.WorkspaceFolder) {
  const config = vscode.workspace.getConfiguration("sfosToolkit", folder.uri);
  return {
    buildDirectory: config.get<string>("build.buildDirectory", "")?.trim() ?? "",
    args: toStringArray(config.get("build.args")),
    qmakeArgs: toStringArray(config.get("build.qmakeArgs")),
    cmakeArgs: toStringArray(config.get("build.cmakeArgs")),
    environment: toStringMap(config.get("build.environment")),
    preSteps: toStringArray(config.get("build.preSteps")),
    postSteps: toStringArray(config.get("build.postSteps"))
  };
}

function readDeploySettings(folder: vscode.WorkspaceFolder) {
  const config = vscode.workspace.getConfiguration("sfosToolkit", folder.uri);
  const method = (config.get<string>("deploy.method", "sdk") ?? "sdk").trim() as DeployMethod;
  return {
    method: (
      ["sdk", "pkcon", "rsync", "zypper", "zypper-dup", "manual"] as string[]
    ).includes(method)
      ? method
      : "sdk",
    args: toStringArray(config.get("deploy.args")),
    environment: toStringMap(config.get("deploy.environment")),
    preSteps: toStringArray(config.get("deploy.preSteps")),
    postSteps: toStringArray(config.get("deploy.postSteps"))
  };
}

async function readRunSettings(folder: vscode.WorkspaceFolder) {
  const config = vscode.workspace.getConfiguration("sfosToolkit", folder.uri);
  const launchCommand = config.get<string>("run.launchCommand", "")?.trim() ?? "";
  const args = toStringArray(config.get("run.args"));
  if (launchCommand) {
    return {
      launchCommand,
      args,
      workingDirectory: config.get<string>("run.workingDirectory", "")?.trim() ?? "",
      environment: toStringMap(config.get("run.environment")),
      debuggerArgs: toStringArray(config.get("run.debuggerArgs"))
    };
  }

  const desktop = await desktopLaunchFromProject(folder);
  return {
    launchCommand: desktop?.launchCommand ?? "",
    args: args.length > 0 ? args : (desktop?.args ?? []),
    workingDirectory: config.get<string>("run.workingDirectory", "")?.trim() ?? "",
    environment: toStringMap(config.get("run.environment")),
    debuggerArgs: toStringArray(config.get("run.debuggerArgs"))
  };
}

async function buildContext(folder: vscode.WorkspaceFolder, buildDirectory: string) {
  const workspaceRoot = folder.uri.fsPath;
  const configured = buildDirectory.trim();
  if (!configured) {
    return { cwd: workspaceRoot, projectArg: null as string | null };
  }

  const cwd = path.isAbsolute(configured) ? configured : path.join(workspaceRoot, configured);
  await fs.mkdir(cwd, { recursive: true });
  return { cwd, projectArg: workspaceRoot };
}

function composeArgs(
  command: string,
  configuredArgs: string[],
  projectArg: string | null,
  config?: Record<string, string>,
  prefixArgs: string[] = []
): string[] {
  const separator = configuredArgs.indexOf("--");
  const options = separator < 0 ? configuredArgs : configuredArgs.slice(0, separator);
  const tail = separator < 0 ? [] : configuredArgs.slice(separator + 1);
  const prefix: string[] = [];
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      if (value.trim()) {
        prefix.push("-c", `${key}=${value.trim()}`);
      }
    }
  }
  return [
    ...prefix,
    command,
    ...prefixArgs,
    ...options,
    ...(projectArg ? [projectArg] : []),
    ...(tail.length > 0 ? ["--", ...tail] : [])
  ];
}

async function runShellSteps(
  steps: string[],
  cwd: string,
  extraEnv: Record<string, string>
): Promise<void> {
  for (const step of steps) {
    if (!step.trim()) {
      continue;
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(step, [], {
        cwd,
        env: { ...process.env, ...extraEnv },
        shell: true
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Command exited with code ${code}: ${step}`));
      });
    });
  }
}

function undeployMethod(method: DeployMethod): "sdk" | "pkcon" | "rsync" | "zypper" {
  if (method === "sdk" || method === "pkcon" || method === "rsync" || method === "zypper") {
    return method;
  }
  return "sdk";
}

function parseInitTypes(
  output: string
): Array<{ name: string; description: string; builders: string[] }> {
  const types: Array<{ name: string; description: string; builders: string[] }> = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const buildersMatch = line.trim().match(/^Builders:\s*(.+)$/i);
    if (buildersMatch) {
      if (types.length > 0) {
        const names = buildersMatch[1]
          .replace(/\(Default:[^)]*\)/i, "")
          .trim()
          .split(/\s+/)
          .filter((name) => name.length > 0);
        types[types.length - 1].builders = names;
      }
      continue;
    }

    const typeMatch = line.match(/^(\S+)\s+\.{2,}\s+(.+)$/);
    if (typeMatch) {
      types.push({ name: typeMatch[1], description: typeMatch[2].trim(), builders: [] });
    }
  }
  return types;
}

async function isProjectInitialized(folder: vscode.WorkspaceFolder): Promise<boolean> {
  const root = folder.uri.fsPath;
  const entries = await fs.readdir(root).catch((): string[] => []);
  if (entries.some((entry) => entry.endsWith(".pro") || entry.endsWith(".spec") || entry.endsWith(".desktop"))) {
    return true;
  }
  if (entries.includes("CMakeLists.txt") || entries.includes("rpm")) {
    return true;
  }
  return false;
}

async function folderNeedsForce(folder: vscode.WorkspaceFolder): Promise<boolean> {
  const entries = await fs.readdir(folder.uri.fsPath).catch(() => []);
  return entries.some((entry) => entry !== ".git" && entry !== ".vscode");
}

async function hasFileSuffix(folder: vscode.WorkspaceFolder, suffix: string): Promise<boolean> {
  const entries = await fs.readdir(folder.uri.fsPath).catch(() => []);
  return entries.some((entry) => entry.endsWith(suffix));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function remoteRunCommand(settings: {
  launchCommand: string;
  args: string[];
  workingDirectory: string;
  environment: Record<string, string>;
}): string {
  const segments: string[] = [];
  if (settings.workingDirectory) {
    segments.push(`cd ${quoteForShell(settings.workingDirectory)}`);
  }
  const envPrefix = Object.entries(settings.environment)
    .map(([key, value]) => `${key}=${quoteForShell(value)}`)
    .join(" ");
  const command = [settings.launchCommand, ...settings.args].map(quoteForShell).join(" ");
  segments.push(`${envPrefix ? `env ${envPrefix} ` : ""}${command}`.trim());
  return segments.join(" && ");
}

function remoteQmlLiveCommand(
  settings: {
    launchCommand: string;
    args: string[];
    workingDirectory: string;
    environment: Record<string, string>;
  },
  targetWorkspace: string
): string {
  const segments: string[] = [];
  if (settings.workingDirectory) {
    segments.push(`cd ${quoteForShell(settings.workingDirectory)}`);
  }
  const environment = {
    ...settings.environment,
    QMLLIVERUNTIME_SAILFISH_WORKSPACE: targetWorkspace,
    QMLLIVERUNTIME_SAILFISH_UPDATE_ON_CONNECT: "1"
  };
  const envPrefix = Object.entries(environment)
    .map(([key, value]) => `${key}=${quoteForShell(value)}`)
    .join(" ");
  const command = ["qmlliveruntime-sailfish", settings.launchCommand, ...settings.args]
    .map(quoteForShell)
    .join(" ");
  segments.push(`env ${envPrefix} ${command}`);
  return segments.join(" && ");
}

function qmlLiveBenchPath(sfdkCommand: string): string {
  if (path.isAbsolute(sfdkCommand)) {
    return path.join(path.dirname(sfdkCommand), "qmllivebench");
  }
  return "qmllivebench";
}

function spawnBench(
  bench: string,
  args: string[],
  timeoutMs: number
): Promise<{ status: number | null; error?: NodeJS.ErrnoException }> {
  return new Promise((resolve) => {
    const child = spawn(bench, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: null });
    }, timeoutMs);
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({ status: null, error });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ status: code });
    });
  });
}

async function qmlLiveRemoteHost(
  sfdkCommand: string,
  deviceName: string | null
): Promise<{ name: string; spec: string } | null> {
  if (!deviceName || !/emulator/i.test(deviceName)) {
    return null;
  }
  const port = (await qmlLiveForwardedPort(sfdkCommand)) ?? "10234";
  return { name: deviceName, spec: `${deviceName},127.0.0.1,${port}` };
}

async function qmlLiveForwardedPort(sfdkCommand: string): Promise<string | null> {
  if (!path.isAbsolute(sfdkCommand)) {
    return null;
  }
  const xmlPath = path.join(
    path.dirname(path.dirname(sfdkCommand)),
    "share/qtcreator/SailfishSDK/libsfdk/emulators.xml"
  );
  let xml: string;
  try {
    xml = await fs.readFile(xmlPath, "utf8");
  } catch {
    return null;
  }
  const match = xml.match(/key="QmlLivePorts">([^<]+)</);
  if (!match) {
    return null;
  }
  const first = match[1].trim().split(/[,-]/)[0];
  return /^\d+$/.test(first) ? first : null;
}

async function qmlLivePaths(folder: vscode.WorkspaceFolder): Promise<{
  hostWorkspace: string;
  targetWorkspace: string;
}> {
  const qmlDir = path.join(folder.uri.fsPath, "qml");
  if (await pathExists(qmlDir)) {
    return {
      hostWorkspace: qmlDir,
      targetWorkspace: "qml"
    };
  }
  return { hostWorkspace: folder.uri.fsPath, targetWorkspace: "." };
}

function quoteForShell(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function pickPreferredItem(
  title: string,
  values: string[],
  preferred: string | null,
  preferredLabel: string
): Promise<string | undefined> {
  if (values.length === 0) {
    void vscode.window.showWarningMessage(`No items available for ${title.toLowerCase()}.`);
    return undefined;
  }

  const ordered =
    preferred && values.includes(preferred)
      ? [preferred, ...values.filter((value) => value !== preferred)]
      : values;

  const picked = await vscode.window.showQuickPick(
    ordered.map((value) => ({
      label: value,
      description: value === preferred ? preferredLabel : undefined
    })),
    { title, ignoreFocusOut: true }
  );
  return picked?.label;
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
