import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { html, LitElement, nothing } from "lit";
import "./tool-call";
import { assistantToolCalls, contentText } from "./message-utils";

export class PiMessageItem extends LitElement {
  declare message?: AgentMessage;
  declare results: Map<string, ToolResultMessage>;

  static override properties = {
    message: { attribute: false },
    results: { attribute: false },
  };

  constructor() {
    super();
    this.results = new Map<string, ToolResultMessage>();
  }

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    if (!this.message || this.message.role === "toolResult") return nothing;

    if (this.message.role === "user") {
      return html`<article class="message-card message-text box info">
        ${contentText(this.message.content)}
      </article>`;
    }

    if (this.message.role === "assistant") {
      const assistant = this.message as AssistantMessage;
      const text = contentText(assistant.content).trim();
      const calls = assistantToolCalls(assistant);
      return html`
        ${text ? html`<article class="message-card message-text box">${text}</article>` : nothing}
        ${calls.map(
          (call) => html`<pi-tool-call
            class="contents"
            .call=${call}
            .result=${this.results.get(call.id)}
          ></pi-tool-call>`,
        )}
      `;
    }

    return nothing;
  }
}

if (!customElements.get("pi-message-item")) {
  customElements.define("pi-message-item", PiMessageItem);
}
