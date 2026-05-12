import type { ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import { contentText } from "@shared/message-content";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { state } from "../state";

@customElement("pi-tool-call")
export class PiToolCall extends LitElement {
  @property({ attribute: false })
  call?: ToolCall;

  @property({ attribute: false })
  result?: ToolResultMessage;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    if (!this.call) return nothing;

    const output = this.result ? contentText(this.result.content).trim() : "";
    const pending = state.pendingToolCalls.has(this.call.id) && !this.result;
    const tone = this.result?.isError ? "bad" : pending ? "warn" : "plain";
    const stateLabel = pending ? "Running" : this.result?.isError ? "Failed" : "Tool";

    return html`
      <details class=${`tool-call message-card ${tone}`} ?open=${pending || Boolean(this.result?.isError)}>
        <summary class="flex-row align-items:center">
          <span class="tool-state">${stateLabel}</span>
          <code class="tool-name">${this.call.name}</code>
        </summary>
        <pre>${output || JSON.stringify(this.call.arguments, null, 2)}</pre>
      </details>
    `;
  }
}
