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
      <footer class="app-chrome composer margin:0">
        <div class="composer-status flex-row container align-items:center justify-content:space-between">
          <p class=${`app-status chip ${this.statusTone}`} role="status">${this.statusText}</p>
          <small class="composer-hint">Enter to send · Shift+Enter for newline</small>
        </div>
        <form
          class="composer-form grid box crowded container wide-inputs margin-block:0"
          @submit=${(event: SubmitEvent) => {
            event.preventDefault();
            this.submit();
          }}
        >
          <textarea
            class="message-input"
            aria-label="Message"
            placeholder="Send a message…"
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
              class="bad"
              @click=${() => this.dispatchEvent(new CustomEvent("abort-session"))}
            >
              Abort
            </button>`
              : html`<strong class="composer-submit">
              <button type="submit" ?disabled=${!this.draft.trim()}>Send</button>
            </strong>`
          }
        </form>
      </footer>
    `;
  }
}
