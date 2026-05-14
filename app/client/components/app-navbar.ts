import type { ModelSummary, SessionMetadataResponse } from "@shared/protocol";
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
    const provider = (event.target as HTMLSelectElement).value;
    const model = this.models.find((candidate) => candidate.provider === provider);
    if (!model) return;
    this.selectModel(provider, model.id);
  }

  private onModelChange(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    this.selectModel(this.selectedProvider(), id);
  }

  private onNewSession() {
    this.dispatchEvent(new CustomEvent("new-session"));
  }

  override render() {
    return html`
      <header class="app-chrome navbar crowded" aria-label="Application bar">
        <nav aria-label="Application">
          <ul role="list">
            <li>
              <span class="app-brand center" aria-hidden="true">π</span>
              <sub-title class="vh">pi web</sub-title>
            </li>
          </ul>
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
                  ?disabled=${this.isStreaming || this.providers().length === 0}
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
                  ?disabled=${this.isStreaming || this.modelsForSelectedProvider().length === 0}
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
          </ul>
        </nav>

        <nav aria-label="Session actions">
          <ul role="list">
            <li>
              <button type="button" ?disabled=${this.isStreaming} @click=${this.onNewSession}>
                New session
              </button>
            </li>
          </ul>
        </nav>
      </header>
    `;
  }
}
