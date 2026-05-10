import { html, LitElement } from "lit";

export class PiAppHeader extends LitElement {
  declare statusText: string;
  declare statusTone: string;
  declare isStreaming: boolean;

  static override properties = {
    statusText: { type: String },
    statusTone: { type: String },
    isStreaming: { type: Boolean },
  };

  constructor() {
    super();
    this.statusText = "";
    this.statusTone = "plain";
    this.isStreaming = false;
  }

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    return html`
      <header
        class="app-chrome app-header flex-switch align-items:center justify-content:space-between margin:0"
      >
        <hgroup>
          <h1 class="app-title"><span class="app-brand center" aria-hidden="true">π</span> pi web</h1>
          <p class="app-subtitle">Local backend-owned pi session</p>
        </hgroup>
        <nav
          class="app-actions tool-bar align-items:center justify-content:end"
          aria-label="Session actions"
        >
          <output class=${`app-status chip ${this.statusTone}`} aria-label="Status">
            ${this.statusText}
          </output>
          <button
            type="button"
            ?disabled=${this.isStreaming}
            @click=${() => this.dispatchEvent(new CustomEvent("new-session"))}
          >
            New session
          </button>
        </nav>
      </header>
    `;
  }
}

if (!customElements.get("pi-app-header")) {
  customElements.define("pi-app-header", PiAppHeader);
}
