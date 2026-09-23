import type { ThinkingLevel } from "@shared/protocol";
import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import "./components/app-navbar";
import "./components/message-composer";
import "./components/session-sidebar";
import "./components/transcript";
import { state } from "./state";
import type { StatusTone } from "./types";

@customElement("pi-web-app")
export class PiWebApp extends LitElement {
  onSend?: (message: string) => void;
  onAbort?: () => void;
  onNewSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onRefreshSessions?: () => void;
  onSelectModel?: (provider: string, id: string) => void;
  onSelectThinkingLevel?: (thinkingLevel: ThinkingLevel) => void;

  @litState()
  private sidebarOpen = window.matchMedia("(min-width: 75ch)").matches;

  private desktopMediaQuery: MediaQueryList | undefined;

  private readonly onViewportChange = (event: MediaQueryListEvent) => {
    this.sidebarOpen = event.matches;
  };

  private readonly onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.isMobileSidebarOpen()) this.closeSidebar(true);
  };

  override connectedCallback() {
    super.connectedCallback();
    this.desktopMediaQuery = window.matchMedia("(min-width: 75ch)");
    this.desktopMediaQuery.addEventListener("change", this.onViewportChange);
    window.addEventListener("keydown", this.onWindowKeyDown);
  }

  override disconnectedCallback() {
    this.desktopMediaQuery?.removeEventListener("change", this.onViewportChange);
    window.removeEventListener("keydown", this.onWindowKeyDown);
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    // Use the document stylesheet bundled from app/client/styles.css.
    return this;
  }

  private isMobileSidebarOpen(): boolean {
    return this.sidebarOpen && this.desktopMediaQuery?.matches === false;
  }

  private toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    if (this.isMobileSidebarOpen()) {
      void this.updateComplete.then(() => {
        this.querySelector<HTMLElement>(".sidebar-close")?.focus();
      });
    }
  }

  private closeSidebar(restoreFocus: boolean) {
    this.sidebarOpen = false;
    if (restoreFocus) {
      void this.updateComplete.then(() => {
        this.querySelector<HTMLElement>(".sessions-toggle")?.focus();
      });
    }
  }

  private closeSidebarOnMobile() {
    if (this.desktopMediaQuery?.matches === false) this.closeSidebar(true);
  }

  private statusText(): string {
    if (state.lastError) return state.lastError;
    if (state.isLoadingSession) return "Loading session…";
    if (!state.sessionId) return "No session";
    return state.isStreaming ? "Streaming…" : "Idle";
  }

  private statusTone(): StatusTone {
    if (state.lastError) return "bad";
    if (state.isLoadingSession || state.isStreaming) return "warn";
    if (state.sessionId) return "ok";
    return "plain";
  }

  override render() {
    const mobileSidebarOpen = this.isMobileSidebarOpen();

    return html`
      <div class="app-shell sidebar-layout" ?data-sidebar-open=${this.sidebarOpen}>
        <header id="sessions-sidebar" class="app-sidebar crowded" aria-label="Sessions sidebar">
          <pi-session-sidebar
            class="contents"
            .sessions=${state.sessions}
            .currentSessionId=${state.sessionId}
            .isStreaming=${state.isStreaming}
            .isLoadingSession=${state.isLoadingSession}
            @new-session=${() => {
              this.closeSidebarOnMobile();
              this.onNewSession?.();
            }}
            @select-session=${(event: CustomEvent<{ sessionId: string }>) => {
              this.closeSidebarOnMobile();
              this.onSelectSession?.(event.detail.sessionId);
            }}
            @refresh-sessions=${() => this.onRefreshSessions?.()}
            @close-sessions=${() => this.closeSidebar(true)}
          ></pi-session-sidebar>
        </header>

        <div class="app-main-shell" ?inert=${mobileSidebarOpen}>
          <pi-app-navbar
            class="contents"
            .sessionId=${state.sessionId}
            .metadata=${state.metadata}
            .models=${state.models}
            .isStreaming=${state.isStreaming}
            .isLoadingSession=${state.isLoadingSession}
            .isUpdatingSessionSettings=${state.isUpdatingSessionSettings}
            .sessionsOpen=${this.sidebarOpen}
            @toggle-sessions=${() => this.toggleSidebar()}
            @select-model=${(event: CustomEvent<{ provider: string; id: string }>) =>
              this.onSelectModel?.(event.detail.provider, event.detail.id)}
            @select-thinking-level=${(event: CustomEvent<{ thinkingLevel: ThinkingLevel }>) =>
              this.onSelectThinkingLevel?.(event.detail.thinkingLevel)}
          ></pi-app-navbar>

          <pi-transcript
            class="contents"
            .messages=${state.messages}
            .transcriptRevision=${state.transcriptRevision}
          ></pi-transcript>

          <pi-message-composer
            class="contents"
            .statusText=${this.statusText()}
            .statusTone=${this.statusTone()}
            .isStreaming=${state.isStreaming}
            .isLoadingSession=${state.isLoadingSession}
            @send-message=${(event: CustomEvent<{ message: string }>) =>
              this.onSend?.(event.detail.message)}
            @abort-session=${() => this.onAbort?.()}
          ></pi-message-composer>
        </div>

        <button
          type="button"
          class="sidebar-backdrop"
          aria-label="Close sessions"
          tabindex=${mobileSidebarOpen ? 0 : -1}
          @click=${() => this.closeSidebar(true)}
        ></button>
      </div>
    `;
  }
}
