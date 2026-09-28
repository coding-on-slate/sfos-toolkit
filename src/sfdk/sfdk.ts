import { spawn } from "child_process";
import * as path from "path";
import * as vscode from "vscode";

export class SfdkClient {
  private chain: Promise<void> = Promise.resolve();
  private output: vscode.OutputChannel | undefined;
  private notifiedMissing = false;
  private notifiedMissingCwd = false;

  commandPath(): string {
    const configured = vscode.workspace
      .getConfiguration("sfosToolkit")
      .get<string>("sfdkPath", "")
      ?.trim();
    return configured ? configured : "sfdk";
  }

  workingDirectory(): string {
    const configured = vscode.workspace
      .getConfiguration("sfosToolkit")
      .get<string>("sfdkCwd", "")
      ?.trim();

    if (!configured || !path.isAbsolute(configured)) {
      this.notifyMissingCwd();
      throw new Error(
        "sfosToolkit.sfdkCwd must be an absolute directory under the Sailfish SDK workspace."
      );
    }

    return configured;
  }

  showOutput(): void {
    this.ensureOutput().show(false);
  }

  run(args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<string> {
    const next = this.chain.then(() => this.spawn(args, options));
    this.chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private spawn(
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let cwd: string;
      try {
        cwd = options?.cwd ?? this.workingDirectory();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      const command = this.commandPath();
      const child = spawn(command, args, {
        cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
        shell: false
      });
      let stdout = "";
      let stderr = "";

      this.ensureOutput().show(false);
      this.log(`$ ${this.quote(command)} ${args.map((arg) => this.quote(arg)).join(" ")}`);

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        this.log(text, false);
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        this.log(text, false);
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          this.notifyNotFound();
          reject(new Error("sfdk not found. Configure the path in settings."));
          return;
        }

        reject(new Error(`Failed to run sfdk: ${error.message}`));
      });

      child.on("close", (code) => {
        this.log(`sfdk exited with code ${code}`);
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }

        reject(new Error(stderr.trim() || `sfdk exited with code ${code}`));
      });
    });
  }

  private notifyNotFound(): void {
    if (this.notifiedMissing) {
      return;
    }
    this.notifiedMissing = true;
    this.openSetting(
      "sfdk was not found in PATH. Configure its location in settings.",
      "sfosToolkit.sfdkPath"
    );
  }

  private notifyMissingCwd(): void {
    if (this.notifiedMissingCwd) {
      return;
    }
    this.notifiedMissingCwd = true;
    this.openSetting(
      "Set sfosToolkit.sfdkCwd to an absolute Sailfish SDK workspace directory.",
      "sfosToolkit.sfdkCwd"
    );
  }

  private openSetting(message: string, setting: string): void {
    void vscode.window.showErrorMessage(message, "Open Settings").then((selection) => {
      if (selection === "Open Settings") {
        void vscode.commands.executeCommand("workbench.action.openSettings", setting);
      }
    });
  }

  private ensureOutput(): vscode.OutputChannel {
    if (!this.output) {
      this.output = vscode.window.createOutputChannel("SFOS Toolkit");
    }
    return this.output;
  }

  private log(text: string, newline = true): void {
    const output = this.ensureOutput();
    if (newline) {
      output.appendLine(text);
    } else {
      output.append(text);
    }
  }

  private quote(value: string): string {
    return value.includes(" ") ? `"${value}"` : value;
  }
}
