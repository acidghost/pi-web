import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./tool-call";
import { contentText } from "@shared/message-content";

@customElement("pi-message-item")
export class PiMessageItem extends LitElement {
  @property({ attribute: false })
  message?: AgentMessage;

  @property({ attribute: false })
  results = new Map<string, ToolResultMessage>();

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    if (!this.message || this.message.role === "toolResult") return nothing;

    if (this.message.role === "user") {
      return html`<article class="message-card box info"
        >${contentText(this.message.content)}</article>`;
    }

    if (this.message.role === "assistant") {
      const text = contentText(this.message.content);
      const calls = this.message.content.filter((block) => block.type === "toolCall");
      return html`
        ${text ? html`<article class="message-card box">${text}</article>` : nothing}
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
