import {
  type ModelSummary,
  type SessionMetadataResponse,
  ThinkingLevelSchema,
} from "@shared/protocol";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("pi-app-navbar")
export class PiAppNavbar extends LitElement {
  @property({ attribute: false })
  sessionId: string | null = null;

  @property({ attribute: false })
  metadata: SessionMetadataResponse | null = null;

  @property({ attribute: false })
  models: ModelSummary[] = [];

  @property({ type: Boolean })
  isStreaming = false;

  @property({ type: Boolean })
  isLoadingSession = false;

  @property({ type: Boolean })
  isUpdatingSessionSettings = false;

  @property({ type: Boolean })
  sessionsOpen = false;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private selectedProvider(): string {
    return this.metadata?.model?.provider ?? this.models[0]?.provider ?? "";
  }

  private selectedModelId(): string {
    return this.metadata?.model?.id ?? "";
  }

  private providers(): string[] {
    const providers = new Set(this.models.map((model) => model.provider));
    if (this.metadata?.model) providers.add(this.metadata.model.provider);
    return [...providers].sort();
  }

  private modelsForSelectedProvider(): ModelSummary[] {
    const provider = this.selectedProvider();
    const models = this.models.filter((model) => model.provider === provider);
    if (
      this.metadata?.model?.provider === provider &&
      !models.some((model) => model.id === this.metadata?.model?.id)
    ) {
      return [this.metadata.model, ...models];
    }
    return models;
  }

  private modelLabel(model: ModelSummary): string {
    return model.name ? `${model.name} (${model.id})` : model.id;
  }

  private selectModel(provider: string, id: string) {
    if (!provider || !id) return;
    if (provider === this.metadata?.model?.provider && id === this.metadata.model.id) return;
    this.dispatchEvent(
      new CustomEvent("select-model", {
        detail: { provider, id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onProviderChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const provider = select.value;
    select.value = this.selectedProvider();
    const model = this.models.find((candidate) => candidate.provider === provider);
    if (!model) return;
    this.selectModel(provider, model.id);
  }

  private onModelChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    select.value = this.selectedModelId();
    this.selectModel(this.selectedProvider(), id);
  }

  private onThinkingLevelChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const thinkingLevel = ThinkingLevelSchema.parse(select.value);
    select.value = this.metadata?.thinkingLevel ?? "off";
    this.dispatchEvent(
      new CustomEvent("select-thinking-level", {
        detail: { thinkingLevel },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onToggleSessions() {
    this.dispatchEvent(new CustomEvent("toggle-sessions", { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <header class="app-chrome navbar crowded margin:0" aria-label="Application bar">
        <nav aria-label="Session navigation">
          <button
            type="button"
            class="sessions-toggle iconbutton"
            title=${this.sessionsOpen ? "Collapse sessions" : "Show sessions"}
            aria-label=${this.sessionsOpen ? "Collapse sessions" : "Show sessions"}
            aria-controls="sessions-sidebar"
            aria-expanded=${this.sessionsOpen}
            @click=${this.onToggleSessions}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
            >
              <rect x="3.5" y="4" width="17" height="16" rx="1.5"></rect>
              <path d="M9 4v16"></path>
            </svg>
          </button>
        </nav>

        <nav aria-label="Session metadata">
          <ul role="list">
            <li class="box padding-block:0 background:none flex-row align-items:center">
              <span class="small-text allcaps">Session</span>
              <code title=${this.sessionId ?? ""}>${this.sessionId ?? "—"}</code>
            </li>
            <li class="box padding-block:0 background:none flex-row align-items:center">
              <span class="small-text allcaps">CWD</span>
              <code title=${this.metadata?.cwd ?? ""}>${this.metadata?.cwd ?? "—"}</code>
            </li>
            <li class="box padding-block:0 background:none flex-row align-items:center">
              <span class="small-text allcaps">Model</span>
              <span>
                <select
                  ?disabled=${
                    this.isStreaming ||
                    this.isLoadingSession ||
                    this.isUpdatingSessionSettings ||
                    this.providers().length === 0
                  }
                  .value=${this.selectedProvider()}
                  @change=${this.onProviderChange}
                  aria-label="Current provider"
                  class="border:none"
                >
                  ${this.providers().map(
                    (provider) => html`<option value=${provider}>${provider}</option>`,
                  )}
                </select>
                <select
                  ?disabled=${
                    this.isStreaming ||
                    this.isLoadingSession ||
                    this.isUpdatingSessionSettings ||
                    this.modelsForSelectedProvider().length === 0
                  }
                  .value=${this.selectedModelId()}
                  @change=${this.onModelChange}
                  aria-label="Current model"
                  class="border:none"
                >
                  ${this.modelsForSelectedProvider().map(
                    (model) => html`<option value=${model.id}>${this.modelLabel(model)}</option>`,
                  )}
                </select>
              </span>
            </li>
            <li class="box padding-block:0 background:none flex-row align-items:center">
              <label class="small-text allcaps" for="thinking-level">Thinking</label>
              <select
                id="thinking-level"
                ?disabled=${
                  this.isStreaming ||
                  this.isLoadingSession ||
                  this.isUpdatingSessionSettings ||
                  !this.sessionId ||
                  !this.metadata
                }
                .value=${this.metadata?.thinkingLevel ?? "off"}
                @change=${this.onThinkingLevelChange}
                aria-label="Thinking level"
                class="border:none"
              >
                ${(this.metadata?.availableThinkingLevels ?? ThinkingLevelSchema.options).map(
                  (level) => html`<option value=${level}>${level}</option>`,
                )}
              </select>
            </li>
          </ul>
        </nav>
      </header>
    `;
  }
}
