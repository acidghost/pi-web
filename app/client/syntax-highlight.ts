import {
  type BundledLanguage,
  type BundledTheme,
  bundledLanguagesInfo,
  getSingletonHighlighter,
  type ShikiTransformer,
} from "shiki";

const LIGHT_THEME = "github-light" satisfies BundledTheme;
const DARK_THEME = "tokyo-night" satisfies BundledTheme;

const bundledLanguageNames = new Set<string>(
  bundledLanguagesInfo
    .flatMap((language) => [language.id, ...(language.aliases ?? [])])
    .map((name) => name.toLowerCase()),
);

export type HighlightResult =
  | { kind: "html"; html: string; language: BundledLanguage }
  | { kind: "plain" };

export async function highlightCode(
  code: string,
  language: BundledLanguage,
  lineNumbers?: { start: number },
): Promise<HighlightResult> {
  try {
    const highlighter = await getSingletonHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: [],
    });
    await highlighter.loadLanguage(language);

    return {
      kind: "html",
      html: highlighter.codeToHtml(code, {
        lang: language,
        themes: {
          light: LIGHT_THEME,
          dark: DARK_THEME,
        },
        defaultColor: "light-dark()",
        mergeSameStyleTokens: true,
        transformers: lineNumbers ? [lineNumberTransformer(lineNumbers.start)] : [],
      }),
      language,
    };
  } catch {
    return { kind: "plain" };
  }
}

export async function highlightPathContent(path: string, code: string): Promise<HighlightResult> {
  const language = inferLanguageFromPath(path);
  if (!language) return { kind: "plain" };

  return highlightCode(code, language);
}

function lineNumberTransformer(start: number): ShikiTransformer {
  return {
    name: "pi-web:line-numbers",
    line(node, line) {
      node.children.unshift({
        type: "element",
        tagName: "span",
        properties: { class: "line-number" },
        children: [{ type: "text", value: String(start + line - 1) }],
      });
    },
  };
}

export function inferLanguageFromPath(path: string): BundledLanguage | undefined {
  const fileName = path.split(/[\\/]/).filter(Boolean).at(-1)?.toLowerCase();
  if (!fileName) return undefined;

  for (const candidate of languageCandidates(fileName)) {
    if (bundledLanguageNames.has(candidate)) return candidate as BundledLanguage;
  }

  return undefined;
}

function languageCandidates(fileName: string): string[] {
  const extension = extensionCandidate(fileName);
  return extension && extension !== fileName ? [fileName, extension] : [fileName];
}

function extensionCandidate(fileName: string): string | undefined {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return undefined;
  return fileName.slice(dotIndex + 1);
}
