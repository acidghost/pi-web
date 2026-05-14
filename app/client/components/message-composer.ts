import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { StatusTone } from "../types";

@customElement("pi-message-composer")
export class PiMessageComposer extends LitElement {
  @property({ type: String })
  statusText = "";

  @property({ type: String })
  statusTone: StatusTone = "plain";

  @property({ type: Boolean })
  isStreaming = false;

  private draft = "";

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private submit() {
    const message = this.draft.trim();
    if (!message || this.isStreaming) return;
    this.draft = "";
    this.dispatchEvent(new CustomEvent("send-message", { detail: { message } }));
    this.requestUpdate();
  }

  override render() {
    return html`
      <footer class="app-chrome margin:0">
        <div class="flex-row container margin-block-end align-items:center justify-content:space-between">
          <p class=${`chip ${this.statusTone}`} role="status">${this.statusText}</p>
          <small class="hidden@s muted-fg">Enter to send · Shift+Enter for newline</small>
        </div>
        <form
          class="grid box crowded container wide-inputs margin-block:0"
          @submit=${(event: SubmitEvent) => {
            event.preventDefault();
            this.submit();
          }}
        >
          <textarea
            data-cols="1 11"
            data-cols@s="1"
            aria-label="Message"
            placeholder="Send a message…"
            rows="5"
            style="resize: vertical;"
            .value=${this.draft}
            ?disabled=${this.isStreaming}
            @input=${(event: InputEvent) => {
              this.draft = (event.target as HTMLTextAreaElement).value;
              this.requestUpdate();
            }}
            @keydown=${(event: KeyboardEvent) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.submit();
              }
            }}
          ></textarea>
          ${
            this.isStreaming
              ? html`<button
                type="button"
                class="justify-content:center bad"
                data-cols="12"
                data-cols@s="1"
                @click=${() => this.dispatchEvent(new CustomEvent("abort-session"))}
              >Abort</button>`
              : html`<button
                type="submit"
                class="justify-content:center"
                data-cols="12"
                data-cols@s="1"
                ?disabled=${!this.draft.trim()}
              >Send</button>`
          }
        </form>
      </footer>
    `;
  }
}
