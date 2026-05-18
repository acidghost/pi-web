import type { ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import { contentText } from "@shared/message-content";
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { state } from "../state";
import { type HighlightPathContentResult, highlightPathContent } from "../syntax-highlight";

type EditReplacement = {
  oldText: string;
  newText: string;
};

type RenderOutput = {
  title?: TemplateResult;
  content: TemplateResult;
};

@customElement("pi-tool-call")
export class PiToolCall extends LitElement {
  @property({ attribute: false })
  call?: ToolCall;

  @property({ attribute: false })
  result?: ToolResultMessage;

  private highlightKey?: string;
  private highlightResult?: HighlightPathContentResult;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    if (!this.call) return nothing;

    const output = this.result ? contentText(this.result.content).trim() : "";
    const pending = state.pendingToolCalls.has(this.call.id) && !this.result;
    const tone = this.result?.isError ? "bad" : pending ? "warn" : "plain";
    const stateLabel = pending ? "Running" : this.result?.isError ? "Failed" : "Tool";

    const { title, content } = this.renderOutput(output);

    return html`
      <details class=${`message-card ${tone}`} ?open=${pending || Boolean(this.result?.isError)}>
        <summary class="flex-row align-items:center">
          <span class="accent-fg">${stateLabel} <code>${this.call.name}</code></span>
          ${title ?? nothing}
        </summary>
        ${content}
      </details>
    `;
  }

  private renderOutput(output: string): RenderOutput {
    if (!this.call) return { content: html`<pre class="tool-raw-output">${output}</pre>` };

    if (this.call.name === "read") return this.renderReadOutput(output);
    if (this.call.name === "write") return this.renderWriteOutput(output);
    if (this.call.name === "edit") return this.renderEditOutput(output);

    return {
      content: html`<pre class="tool-raw-output">${output || safeJson(this.call.arguments)}</pre>`,
    };
  }

  private renderReadOutput(output: string): RenderOutput {
    if (!this.call) return { content: html`Loading...` };
    const readPath = getToolPath(this.call.arguments);
    if (!readPath) {
      return {
        content: html`<pre class="tool-raw-output">${output || safeJson(this.call?.arguments)}</pre>`,
      };
    }

    const content =
      output && this.result && !this.result.isError
        ? this.renderHighlightedPathContent(readPath, output)
        : html`<pre class="tool-raw-output">${output || safeJson(this.call?.arguments)}</pre>`;

    return { title: html`<code>${readPath}</code>`, content };
  }

  private renderWriteOutput(output: string): RenderOutput {
    if (!this.call) return { content: html`Loading...` };
    const writePath = getToolPath(this.call.arguments);
    const fileContent = getWriteContent(this.call.arguments);
    const fallback = output || safeJson(this.call.arguments);

    if (!writePath || fileContent === undefined) {
      return {
        title: writePath ? html`<code>${writePath}</code>` : undefined,
        content: html`<pre class="tool-raw-output">${fallback}</pre>`,
      };
    }

    return {
      title: html`<code>${writePath}</code>`,
      content: html`
        ${
          this.result?.isError && output
            ? html`<pre class="tool-error-output">${output}</pre>`
            : nothing
        }
        ${this.renderHighlightedPathContent(writePath, fileContent)}
        ${
          !this.result?.isError && output
            ? html`<p class="tool-result-summary muted-fg"><small>${output}</small></p>`
            : nothing
        }
      `,
    };
  }

  private renderEditOutput(output: string): RenderOutput {
    if (!this.call) return { content: html`Loading...` };
    const editPath = getToolPath(this.call.arguments);
    const diff = getEditDiff(this.result?.details);
    const edits = getEditList(this.call.arguments);
    const fallback = output || safeJson(this.call.arguments);

    let content: TemplateResult;
    if (this.result?.isError) {
      content = html`
        ${output ? html`<pre class="tool-error-output">${output}</pre>` : nothing}
        ${
          diff
            ? this.renderDiff(diff)
            : edits.length
              ? this.renderEditList(edits)
              : html`<pre class="tool-raw-output">${fallback}</pre>`
        }
      `;
    } else if (diff) {
      content = html`
        ${this.renderDiff(diff)}
        ${output ? html`<p class="tool-result-summary muted-fg"><small>${output}</small></p>` : nothing}
      `;
    } else if (edits.length) {
      content = html`
        ${this.renderEditList(edits)}
        ${output ? html`<p class="tool-result-summary muted-fg"><small>${output}</small></p>` : nothing}
      `;
    } else {
      content = html`<pre class="tool-raw-output">${fallback}</pre>`;
    }

    return {
      title: editPath ? html`<code>${editPath}</code>` : undefined,
      content,
    };
  }

  private renderHighlightedPathContent(path: string, output: string): TemplateResult {
    const key = `${this.call?.id ?? ""}\0${path}\0${output}`;
    if (this.highlightKey !== key) {
      this.highlightKey = key;
      this.highlightResult = undefined;
      void highlightPathContent(path, output).then((result) => {
        if (this.highlightKey !== key) return;

        this.highlightResult = result;
        this.requestUpdate();
      });
    }

    if (this.highlightResult?.kind === "html") {
      return html`<div class="highlighted">${unsafeHTML(this.highlightResult.html)}</div>`;
    }

    return html`<pre class="tool-raw-output">${output}</pre>`;
  }

  private renderDiff(diff: string): TemplateResult {
    return html`<pre class="tool-diff">${diff.split("\n").map((line) => {
      const className = diffLineClass(line);
      return html`<span class=${className}>${line || " "}</span>`;
    })}</pre>`;
  }

  private renderEditList(edits: EditReplacement[]): TemplateResult {
    return html`
      <div class="tool-edit-list">
        ${edits.map(
          (edit, index) => html`
            <section class="tool-edit-item">
              <p class="tool-edit-label muted-fg"><small>Edit ${index + 1}</small></p>
              <pre class="tool-edit-old">${edit.oldText}</pre>
              <pre class="tool-edit-new">${edit.newText}</pre>
            </section>
          `,
        )}
      </div>
    `;
  }
}

function getToolPath<T>(record: Record<string, T>): string | undefined {
  const path = record?.path ?? record?.file_path;
  return typeof path === "string" ? path : undefined;
}

function getWriteContent<T>(record: Record<string, T>): string | undefined {
  const content = record?.content;
  return typeof content === "string" ? content : undefined;
}

function getEditList<T>(record: Record<string, T>): EditReplacement[] {
  if (!record) return [];

  const edits = typeof record.edits === "string" ? parseJson(record.edits) : record.edits;
  if (Array.isArray(edits)) {
    return edits.filter(isEditReplacement);
  }

  const legacyEdit = { oldText: record.oldText, newText: record.newText };
  return isEditReplacement(legacyEdit) ? [legacyEdit] : [];
}

function getEditDiff(details: unknown): string | undefined {
  const record = asRecord(details);
  const directDiff = record?.diff;
  if (typeof directDiff === "string") return directDiff;

  const nestedDiff = asRecord(record?.details)?.diff;
  return typeof nestedDiff === "string" ? nestedDiff : undefined;
}

function isEditReplacement(value: unknown): value is EditReplacement {
  const record = asRecord(value);
  return typeof record?.oldText === "string" && typeof record.newText === "string";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function diffLineClass(line: string): string {
  if (line.startsWith("@@")) return "tool-diff-line tool-diff-hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "tool-diff-line";
  if (line.startsWith("+")) return "tool-diff-line tool-diff-add";
  if (line.startsWith("-")) return "tool-diff-line tool-diff-delete";
  return "tool-diff-line";
}
