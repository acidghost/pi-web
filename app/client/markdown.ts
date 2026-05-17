import DOMPurify, { type Config } from "dompurify";
import { html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { Marked } from "marked";

const markdown = new Marked<string, string>({
  async: false,
  breaks: true,
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    del({ tokens }) {
      return `<s>${this.parser.parseInline(tokens)}</s>`;
    },
    image({ text }) {
      return escapeHtml(text || "[image]");
    },
  },
});

const sanitizerConfig = {
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  ALLOWED_ATTR: ["checked", "disabled", "href", "type"],
  ALLOWED_TAGS: [
    "a",
    "blockquote",
    "br",
    "code",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
} satisfies Config;

export function renderMarkdown(source: string): TemplateResult | typeof nothing {
  if (!source.trim()) return nothing;

  try {
    const rendered = markdown.parse(source, { async: false });
    const sanitized = sanitizeHtml(rendered);
    return html`<div class="markdown-content">${unsafeHTML(sanitized)}</div>`;
  } catch {
    return html`<div class="markdown-content markdown-content--plain">${source}</div>`;
  }
}

function sanitizeHtml(source: string): string {
  const sanitized = DOMPurify.sanitize(source, sanitizerConfig);
  return hardenSanitizedHtml(sanitized);
}

function hardenSanitizedHtml(source: string): string {
  const template = document.createElement("template");
  template.innerHTML = source;

  for (const link of Array.from(template.content.querySelectorAll("a"))) {
    if (!link.hasAttribute("href")) {
      unwrapElement(link);
      continue;
    }

    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }

  for (const input of Array.from(template.content.querySelectorAll("input"))) {
    if (input.getAttribute("type")?.toLowerCase() !== "checkbox") {
      unwrapElement(input);
      continue;
    }

    input.setAttribute("type", "checkbox");
    input.setAttribute("disabled", "");
  }

  return template.innerHTML;
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function escapeHtml(source: string): string {
  return source.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        throw new Error(`Unhandled HTML escape character: ${character}`);
    }
  });
}
