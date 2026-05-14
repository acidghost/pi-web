import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./message-item";

@customElement("pi-transcript")
export class PiTranscript extends LitElement {
  @property({ attribute: false })
  messages: AgentMessage[] = [];

  @property({ type: Number, attribute: "transcript-revision" })
  transcriptRevision = 0;

  private lastAutoScrolledTranscriptRevision = 0;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      const scroller = this.querySelector<HTMLElement>("#transcript");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  }

  protected override updated(): void {
    if (this.lastAutoScrolledTranscriptRevision === this.transcriptRevision) return;
    this.lastAutoScrolledTranscriptRevision = this.transcriptRevision;
    this.scrollToBottom();
  }

  override render() {
    return html`
      <main id="transcript" class="fullbleed margin:0">
        ${
          this.messages.length
            ? this.renderMessages()
            : html`
            <section class="empty-state box info text-align:center" aria-label="Empty conversation">
              <p class="empty-state-label allcaps">Ready</p>
              <h2>Start a local pi conversation</h2>
              <p>Ask pi to inspect files, run commands, or make code changes in this cwd.</p>
            </section>
          `
        }
      </main>
    `;
  }

  private renderMessages() {
    const results = new Map<string, ToolResultMessage>();
    for (const message of this.messages) {
      if (message.role === "toolResult") results.set(message.toolCallId, message);
    }
    return html`
      <ol
        class="message-list flex-column container padding-inline margin-block:0"
        role="list"
        aria-label="Conversation"
      >
        ${this.messages.map((message, index) =>
          message.role === "user" || message.role === "assistant"
            ? html`<li
              class=${`message flex-column align-items:${message.role === "user" ? "end" : "start"}`}
              data-author=${message.role}
              data-message-index=${index}
            >
              <pi-message-item
                class="contents"
                .message=${message}
                .results=${results}
              ></pi-message-item>
            </li>`
            : nothing,
        )}
      </ol>
    `;
  }
}
