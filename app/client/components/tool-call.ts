import type { ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import { contentText } from "@shared/message-content";
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { BundledLanguage } from "shiki";
import { state } from "../state";
import { type HighlightResult, highlightCode, inferLanguageFromPath } from "../syntax-highlight";

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
  private highlightResult?: HighlightResult;

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
    if (this.call.name === "bash") return this.renderBashOutput(output);

    return {
      content: html`<pre class="tool-raw-output">${output || safeJson(this.call.arguments)}</pre>`,
    };
  }

  private renderBashOutput(output: string): RenderOutput {
    if (!this.call) return { content: html`Loading...` };
    const command = getBashCommand(this.call.arguments);
    const fallback = output || safeJson(this.call.arguments);

    if (command === undefined) {
      return { content: html`<pre class="tool-raw-output">${fallback}</pre>` };
    }

    const commandSummary = summarizeCommand(command);

    return {
      title: html`<code class="tool-call-command" title=${command}>${commandSummary}</code>`,
      content: html`
        ${this.renderHighlightedContent(`bash\0${command}`, command, "bash")}
        ${
          output && this.result?.isError
            ? html`<pre class="tool-error-output">${output}</pre>`
            : nothing
        }
        ${
          output && !this.result?.isError
            ? html`<pre class="tool-raw-output">${output}</pre>`
            : nothing
        }
      `,
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

    const { offset, limit } = getReadRange(this.call.arguments);
    const hasFileContent = Boolean(output && this.result && !this.result.isError);
    const { content: fileContent, note } = hasFileContent
      ? splitReadNote(output)
      : { content: "", note: undefined };
    const lineCount = fileContent ? countLines(fileContent) : limit;
    const rangeLabel = readRangeLabel(offset, limit, lineCount);
    const title = html`<code>${rangeLabel ? `${readPath}:${rangeLabel}` : readPath}</code>`;

    if (!hasFileContent || !fileContent) {
      return {
        title,
        content: html`<pre class="tool-raw-output">${output || safeJson(this.call.arguments)}</pre>`,
      };
    }

    return {
      title,
      content: html`
        ${this.renderHighlightedPathContent(readPath, fileContent, offset ?? 1)}
        ${note ? html`<p class="tool-result-summary muted-fg"><small>${note}</small></p>` : nothing}
      `,
    };
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
        ${this.renderHighlightedPathContent(writePath, fileContent, 1)}
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

  private renderHighlightedPathContent(
    path: string,
    output: string,
    startLine?: number,
  ): TemplateResult {
    const language = inferLanguageFromPath(path);
    if (!language) return html`<pre class="tool-raw-output">${output}</pre>`;

    return this.renderHighlightedContent(
      `${this.call?.id ?? ""}\0${path}\0${startLine ?? ""}\0${output}`,
      output,
      language,
      startLine !== undefined ? { start: startLine } : undefined,
    );
  }

  private renderHighlightedContent(
    key: string,
    code: string,
    language: BundledLanguage,
    lineNumbers?: { start: number },
  ): TemplateResult {
    if (this.highlightKey !== key) {
      this.highlightKey = key;
      this.highlightResult = undefined;
      void highlightCode(code, language, lineNumbers).then((result) => {
        if (this.highlightKey !== key) return;

        this.highlightResult = result;
        this.requestUpdate();
      });
    }

    if (this.highlightResult?.kind === "html") {
      return html`<div class="highlighted">${unsafeHTML(this.highlightResult.html)}</div>`;
    }

    return html`<pre class="tool-raw-output">${code}</pre>`;
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

const COMMAND_SUMMARY_MAX = 80;

function summarizeCommand(command: string): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (normalized.length <= COMMAND_SUMMARY_MAX) return normalized;

  return `${normalized.slice(0, COMMAND_SUMMARY_MAX - 1)}…`;
}

const READ_NOTE_PATTERN =
  /\n\n\[(?:Showing lines \d+-\d+ of \d+|\d+ more lines in file)[^\]]*\]\s*$/;
const FIRST_LINE_NOTE_PATTERN = /^\[Line \d+ is [^\]]*\]$/;

/**
 * Split read output into file content and pi's trailing continuation note
 * ("[Showing lines 5-10 of 100. Use offset=11 to continue.]" and friends),
 * so the note is not rendered as numbered, highlighted code.
 */
function splitReadNote(output: string): { content: string; note?: string } {
  const stripped = output.replace(/\n$/, "");
  if (FIRST_LINE_NOTE_PATTERN.test(stripped)) return { content: "", note: stripped };

  const match = stripped.match(READ_NOTE_PATTERN);
  if (!match || match.index === undefined) return { content: stripped };

  return {
    content: stripped.slice(0, match.index),
    note: match[0].trim(),
  };
}

function getReadRange<T>(record: Record<string, T>): { offset?: number; limit?: number } {
  return {
    offset: typeof record?.offset === "number" ? record.offset : undefined,
    limit: typeof record?.limit === "number" ? record.limit : undefined,
  };
}

function readRangeLabel(
  offset: number | undefined,
  limit: number | undefined,
  lineCount: number | undefined,
): string | undefined {
  if ((offset === undefined && limit === undefined) || !lineCount) return undefined;

  const start = offset ?? 1;
  return `${start}-${start + lineCount - 1}`;
}

function countLines(text: string): number {
  return text.split("\n").length;
}

function getBashCommand<T>(record: Record<string, T>): string | undefined {
  const command = record?.command;
  return typeof command === "string" ? command : undefined;
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
