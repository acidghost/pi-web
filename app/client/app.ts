import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "./components/app-header";
import "./components/message-composer";
import "./components/session-metadata";
import "./components/transcript";
import { state } from "./state";
import type { StatusTone } from "./types";

@customElement("pi-web-app")
export class PiWebApp extends LitElement {
  onSend?: (message: string) => void;
  onAbort?: () => void;
  onNewSession?: () => void;
  onSelectModel?: (provider: string, id: string) => void;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    // Use the document stylesheet bundled from app/client/styles.css.
    return this;
  }

  private statusText(): string {
    if (state.lastError) return state.lastError;
    if (!state.sessionId) return "No session";
    return state.isStreaming ? "Streaming…" : "Idle";
  }

  private statusTone(): StatusTone {
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
        .models=${state.models}
        .isStreaming=${state.isStreaming}
        @select-model=${(event: CustomEvent<{ provider: string; id: string }>) =>
          this.onSelectModel?.(event.detail.provider, event.detail.id)}
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
