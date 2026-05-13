import type { ModelSummary, SessionMetadataResponse } from "@shared/protocol";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("pi-session-metadata")
export class PiSessionMetadata extends LitElement {
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
          <div class="metadata-card box crowded">
            <dt class="metadata-label allcaps">Provider / model</dt>
            <dd class="flex-switch align-items:center wide-inputs">
              <select
                class="flex-grow:0"
                ?disabled=${this.isStreaming || this.providers().length === 0}
                .value=${this.selectedProvider()}
                @change=${this.onProviderChange}
                aria-label="Current provider"
              >
                ${this.providers().map(
                  (provider) => html`<option value=${provider}>${provider}</option>`,
                )}
              </select>
              <select
                class="flex-grow:1"
                ?disabled=${this.isStreaming || this.modelsForSelectedProvider().length === 0}
                .value=${this.selectedModelId()}
                @change=${this.onModelChange}
                aria-label="Current model"
              >
                ${this.modelsForSelectedProvider().map(
                  (model) => html`<option value=${model.id}>${this.modelLabel(model)}</option>`,
                )}
              </select>
            </dd>
          </div>
        </dl>
      </section>
    `;
  }
}
