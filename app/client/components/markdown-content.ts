import { getSharedHighlighter } from "@pierre/diffs";
import DOMPurify from "dompurify";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderMarkdownHtml } from "../markdown";

@customElement("pi-markdown-content")
export class PiMarkdownContent extends LitElement {
  @property({ attribute: false })
  source = "";

  @state()
  private renderedHtml = "";

  private renderedSource?: string;
  private requestedSource?: string;
  private preparedSource?: string;
  private preparedHtml = "";
  private highlightRequest = 0;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    if (!this.source.trim()) return nothing;

    const content =
      this.renderedSource === this.source ? this.renderedHtml : this.prepareMarkdown(this.source);
    return html`<div class="markdown-content">${unsafeHTML(content)}</div>`;
  }

  protected override updated(): void {
    if (this.source === this.requestedSource) return;

    const source = this.source;
    const request = ++this.highlightRequest;
    this.requestedSource = source;
    if (!source.trim()) return;

    const initialHtml = this.prepareMarkdown(source);
    void highlightCodeBlocks(initialHtml)
      .then((highlightedHtml) => {
        if (!highlightedHtml || request !== this.highlightRequest || source !== this.source) return;
        this.renderedHtml = highlightedHtml;
        this.renderedSource = source;
      })
      .catch((error: unknown) => {
        if (request !== this.highlightRequest || source !== this.source) return;
        console.warn("[markdown] highlight pass failed", error);
        this.renderedHtml = initialHtml;
        this.renderedSource = source;
      });
  }

  private prepareMarkdown(source: string): string {
    if (this.preparedSource !== source) {
      this.preparedSource = source;
      this.preparedHtml = renderMarkdownHtml(source);
    }
    return this.preparedHtml;
  }
}

async function highlightCodeBlocks(source: string): Promise<string | undefined> {
  const template = document.createElement("template");
  template.innerHTML = source;
  const codeBlocks = Array.from(
    template.content.querySelectorAll<HTMLElement>('pre > code[class*="language-"]'),
  );
  if (codeBlocks.length === 0) return undefined;

  await Promise.all(
    codeBlocks.map(async (code) => {
      const language = getCodeLanguage(code);
      try {
        const highlighter = await getSharedHighlighter({
          themes: ["pierre-light", "pierre-dark"],
          langs: [language],
        });
        const highlightedHtml = await highlighter.codeToHtml(code.textContent ?? "", {
          lang: language,
          themes: { light: "pierre-light", dark: "pierre-dark" },
          defaultColor: "light-dark()",
          rootStyle: false,
        });
        const highlightedTemplate = document.createElement("template");
        highlightedTemplate.innerHTML = sanitizeHighlightedHtml(highlightedHtml);
        const highlightedPre = highlightedTemplate.content.querySelector("pre");
        if (highlightedPre) code.parentElement?.replaceWith(highlightedPre);
      } catch (error) {
        console.warn("[markdown] failed to highlight code block", { language, error });
      }
    }),
  );

  return template.innerHTML;
}

function getCodeLanguage(code: HTMLElement): string {
  const languageClass = Array.from(code.classList).find((name) => name.startsWith("language-"));
  return languageClass?.slice("language-".length) || "text";
}

function sanitizeHighlightedHtml(source: string): string {
  const sanitized = DOMPurify.sanitize(source, {
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    ALLOWED_ATTR: ["class", "style", "tabindex"],
    ALLOWED_TAGS: ["code", "pre", "span"],
  });
  return sanitized;
}
