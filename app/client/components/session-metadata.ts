import type { SessionMetadataResponse } from "@shared/protocol";
import { html, LitElement } from "lit";

export class PiSessionMetadata extends LitElement {
  declare sessionId: string | null;
  declare metadata: SessionMetadataResponse | null;

  static override properties = {
    sessionId: { attribute: false },
    metadata: { attribute: false },
  };

  constructor() {
    super();
    this.sessionId = null;
    this.metadata = null;
  }

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    return html`
      <section class="session-metadata margin:0" aria-label="Session metadata">
        <dl class="metadata-list grid container">
          <div class="metadata-card box crowded">
            <dt class="metadata-label allcaps">Session</dt>
            <dd><code>${this.sessionId ?? "—"}</code></dd>
          </div>
          <div class="metadata-card box crowded">
            <dt class="metadata-label allcaps">CWD</dt>
            <dd><code>${this.metadata?.cwd ?? "—"}</code></dd>
          </div>
        </dl>
      </section>
    `;
  }
}

if (!customElements.get("pi-session-metadata")) {
  customElements.define("pi-session-metadata", PiSessionMetadata);
}
