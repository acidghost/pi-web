import type { SessionListItem } from "@shared/protocol";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

function formatSessionTitle(session: SessionListItem): string {
  const title = session.name?.trim() || session.firstMessage.trim();
  return title || "Untitled session";
}

function formatMessageCount(count: number): string {
  return `${count} ${count === 1 ? "msg" : "msgs"}`;
}

function formatUpdatedAt(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) return "now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d ago`;

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(timestamp),
  );
}

@customElement("pi-session-sidebar")
export class PiSessionSidebar extends LitElement {
  @property({ attribute: false })
  sessions: SessionListItem[] = [];

  @property({ type: String })
  currentSessionId: string | null = null;

  @property({ type: Boolean })
  isStreaming = false;

  @property({ type: Boolean })
  isLoadingSession = false;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private onNewSession() {
    this.dispatchEvent(new CustomEvent("new-session", { bubbles: true, composed: true }));
  }

  private onRefreshSessions() {
    this.dispatchEvent(new CustomEvent("refresh-sessions", { bubbles: true, composed: true }));
  }

  private onCloseSessions() {
    this.dispatchEvent(new CustomEvent("close-sessions", { bubbles: true, composed: true }));
  }

  private onSelectSession(event: Event, session: SessionListItem) {
    event.preventDefault();
    const isCurrent = session.id === this.currentSessionId;
    if (isCurrent || this.isLoadingSession || this.isStreaming || session.isStreaming) return;
    this.dispatchEvent(
      new CustomEvent("select-session", {
        detail: { sessionId: session.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderSession(session: SessionListItem) {
    const isCurrent = session.id === this.currentSessionId;
    const isStreaming = session.isStreaming || (isCurrent && this.isStreaming);
    const switchingDisabled = this.isLoadingSession || this.isStreaming || session.isStreaming;
    const title = formatSessionTitle(session);
    let disabledReason = "";
    if (this.isLoadingSession) {
      disabledReason = "A session is loading";
    } else if (this.isStreaming) {
      disabledReason = "Cannot switch sessions while the current session is running";
    } else if (session.isStreaming) {
      disabledReason = "Cannot open this session while it is running";
    }
    const tooltip = disabledReason
      ? `${title}\n${session.id}\n${disabledReason}`
      : `${title}\n${session.id}`;

    return html`
      <li>
        <a
          class="session-list-item"
          href=${switchingDisabled ? nothing : `?session=${encodeURIComponent(session.id)}`}
          title=${tooltip}
          aria-current=${isCurrent ? "page" : nothing}
          aria-disabled=${switchingDisabled ? "true" : nothing}
          @click=${(event: Event) => this.onSelectSession(event, session)}
        >
          <span class="session-title">${title}</span>
          ${
            isStreaming
              ? html`<span class="status-dot streaming" aria-hidden="true"></span>`
              : nothing
          }
          <span class="session-meta">
            <span>${formatUpdatedAt(session.updatedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>${formatMessageCount(session.messageCount)}</span>
            ${
              isStreaming
                ? html`<span aria-hidden="true">·</span><span class="snippet">Running</span>`
                : nothing
            }
          </span>
        </a>
      </li>
    `;
  }

  override render() {
    return html`
      <section aria-label="App identity">
        <div class="brand-row">
          <span class="app-brand center" aria-hidden="true">π</span>
          <span class="brand-copy">
            <strong>pi web</strong>
            <span class="small-text allcaps muted-fg">local sessions</span>
          </span>
          <button
            type="button"
            class="sidebar-close iconbutton"
            aria-label="Close sessions"
            @click=${this.onCloseSessions}
          >×</button>
        </div>
      </section>

      <nav class="session-list-scroll" aria-label="Sessions">
        <div class="sidebar-actions margin-block-end">
          <button
            type="button"
            class="inline-size:100%"
            ?disabled=${this.isStreaming || this.isLoadingSession}
            @click=${this.onNewSession}
          >
            New
          </button>
          <button type="button" title="Refresh sessions" aria-label="Refresh sessions" @click=${this.onRefreshSessions}>
            ↻
          </button>
        </div>

        ${
          this.sessions.length
            ? html`<ol class="session-list" role="list">
                ${this.sessions.map((session) => this.renderSession(session))}
              </ol>`
            : html`<p class="empty-session-list muted-fg small-text">No sessions yet.</p>`
        }
      </nav>
    `;
  }
}
