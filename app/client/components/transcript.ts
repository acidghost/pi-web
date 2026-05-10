import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { html, LitElement, nothing } from "lit";
import "./message-item";
import { toolResultById } from "./message-utils";

export class PiTranscript extends LitElement {
  declare messages: AgentMessage[];
  declare transcriptRevision: number;
  private lastAutoScrolledTranscriptRevision = 0;

  static override properties = {
    messages: { attribute: false },
    transcriptRevision: { type: Number, attribute: "transcript-revision" },
  };

  constructor() {
    super();
    this.messages = [];
    this.transcriptRevision = 0;
  }

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
    const results = toolResultById(this.messages);
    return html`
      <main id="transcript" class="transcript margin:0">
        ${
          this.messages.length
            ? html`
              <ol class="message-list flex-column container padding-inline margin-block:0" role="list" aria-label="Conversation">
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
            `
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
}

if (!customElements.get("pi-transcript")) {
  customElements.define("pi-transcript", PiTranscript);
}
