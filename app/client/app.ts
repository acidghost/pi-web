import { html, LitElement } from "lit";
import "./components/app-header";
import "./components/message-composer";
import "./components/session-metadata";
import "./components/transcript";
import { state } from "./state";

export class PiWebApp extends LitElement {
  onSend?: (message: string) => void;
  onAbort?: () => void;
  onNewSession?: () => void;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    // Use the document stylesheet bundled from app/client/styles.css.
    return this;
  }

  private statusText(): string {
    if (state.lastError) return state.lastError;
    if (!state.sessionId) return "No session";
    return state.isStreaming ? "Streaming…" : "Idle";
  }

  private statusTone(): string {
    if (state.lastError) return "bad";
    if (state.isStreaming) return "warn";
    if (state.sessionId) return "ok";
    return "plain";
  }

  override render() {
    const statusText = this.statusText();
    const statusTone = this.statusTone();

    return html`
      <pi-app-header
        class="contents"
        .statusText=${statusText}
        .statusTone=${statusTone}
        .isStreaming=${state.isStreaming}
        @new-session=${() => this.onNewSession?.()}
      ></pi-app-header>

      <pi-session-metadata
        class="contents"
        .sessionId=${state.sessionId}
        .metadata=${state.metadata}
      ></pi-session-metadata>

      <pi-transcript
        class="contents"
        .messages=${state.messages}
        .transcriptRevision=${state.transcriptRevision}
      ></pi-transcript>

      <pi-message-composer
        class="contents"
        .statusText=${statusText}
        .statusTone=${statusTone}
        .isStreaming=${state.isStreaming}
        @send-message=${(event: CustomEvent<{ message: string }>) =>
          this.onSend?.(event.detail.message)}
        @abort-session=${() => this.onAbort?.()}
      ></pi-message-composer>
    `;
  }
}

if (!customElements.get("pi-web-app")) {
  customElements.define("pi-web-app", PiWebApp);
}
