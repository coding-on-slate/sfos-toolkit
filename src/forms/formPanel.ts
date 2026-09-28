import * as fs from "fs";
import * as vscode from "vscode";
import { FormDocument, FormHandler } from "./types";

type FormMessage =
  | { type: "ready" }
  | { type: "commit"; key: string; value: string }
  | { type: "commitAll"; values: Record<string, string> };

export class FormPanel implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly handlers = new Map<string, FormHandler>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  dispose(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
    this.handlers.clear();
  }

  async open(id: string, title: string, handler: FormHandler): Promise<void> {
    this.handlers.set(id, handler);

    const existing = this.panels.get(id);
    if (existing) {
      existing.title = title;
      existing.reveal(vscode.ViewColumn.Active);
      await this.postForm(id);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "sfosToolkit.form",
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media", "forms")]
      }
    );

    this.panels.set(id, panel);
    panel.onDidDispose(() => {
      this.panels.delete(id);
      this.handlers.delete(id);
    });
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: FormMessage) => {
      void this.onMessage(id, message);
    });
  }

  async refresh(id: string): Promise<void> {
    if (!this.panels.has(id)) {
      return;
    }
    await this.postForm(id);
  }

  close(id: string): void {
    this.panels.get(id)?.dispose();
  }

  private async onMessage(id: string, message: FormMessage): Promise<void> {
    const handler = this.handlers.get(id);
    if (!handler) {
      return;
    }

    try {
      if (message.type === "ready") {
        await this.postForm(id);
        return;
      }

      if (message.type === "commit") {
        if (!handler.commitField) {
          return;
        }
        await handler.commitField(message.key, message.value);
        await this.postForm(id);
        return;
      }

      if (message.type === "commitAll") {
        if (!handler.commitAll) {
          return;
        }
        await handler.commitAll(message.values);
        await this.postForm(id);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(text);
      await this.postForm(id);
    }
  }

  private async postForm(id: string): Promise<void> {
    const panel = this.panels.get(id);
    const handler = this.handlers.get(id);
    if (!panel || !handler) {
      return;
    }

    try {
      const form: FormDocument = await handler.load();
      await panel.webview.postMessage({ type: "setForm", form });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(text);
    }
  }

  private html(webview: vscode.Webview): string {
    const folder = vscode.Uri.joinPath(this.context.extensionUri, "media", "forms");
    const html = fs.readFileSync(vscode.Uri.joinPath(folder, "form.html").fsPath, "utf8");
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(folder, "form.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(folder, "form.js"));

    return html
      .split("{{cspSource}}")
      .join(webview.cspSource)
      .split("{{styleUri}}")
      .join(styleUri.toString())
      .split("{{scriptUri}}")
      .join(scriptUri.toString());
  }
}
