import type { SessionMetadataResponse } from "@shared/protocol";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("pi-session-metadata")
export class PiSessionMetadata extends LitElement {
  @property({ attribute: false })
  sessionId: string | null = null;

  @property({ attribute: false })
  metadata: SessionMetadataResponse | null = null;

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
