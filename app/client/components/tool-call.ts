import type { ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import { contentText } from "@shared/message-content";
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { state } from "../state";
import { type HighlightReadOutputResult, highlightReadOutput } from "../syntax-highlight";

@customElement("pi-tool-call")
export class PiToolCall extends LitElement {
  @property({ attribute: false })
  call?: ToolCall;

  @property({ attribute: false })
  result?: ToolResultMessage;

  private highlightKey?: string;
  private highlightResult?: HighlightReadOutputResult;

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

  private renderOutput(output: string): { title?: TemplateResult; content: TemplateResult } {
    if (!this.call) return { content: html`<pre>${output}</pre>` };

    if (this.call.name === "read") {
      const readPath = this.call.arguments.path.trim();
      const content =
        output && this.result && !this.result.isError
          ? this.renderHighlightedReadOutput(readPath, output)
          : html`<pre>${output || JSON.stringify(this.call.arguments, null, 2)}</pre>`;

      return { title: html`<code>${readPath}</code>`, content };
    }

    return {
      content: html`<pre>${output || JSON.stringify(this.call.arguments, null, 2)}</pre>`,
    };
  }

  private renderHighlightedReadOutput(path: string, output: string): TemplateResult {
    const key = `${this.call?.id ?? ""}\0${path}\0${output}`;
    if (this.highlightKey !== key) {
      this.highlightKey = key;
      this.highlightResult = undefined;
      void highlightReadOutput(path, output).then((result) => {
        if (this.highlightKey !== key) return;

        this.highlightResult = result;
        console.debug("Requesting update", { path, toolCallId: this.call?.id });
        this.requestUpdate();
      });
    }

    if (this.highlightResult?.kind === "html") {
      return html`<div class="highlighted">${unsafeHTML(this.highlightResult.html)}</div>`;
    }

    return html`<pre>${output}</pre>`;
  }
}
