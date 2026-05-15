import { preloadHighlighter } from "@pierre/diffs";

export const DECK_LANGS = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "sql",
  "rust",
  "markdown",
  "json",
  "toml",
  "yaml",
  "shell",
  "css",
  "python",
  "go",
  "swift",
  "java",
] as const;

export const DECK_THEMES = ["pierre-dark", "pierre-light"] as const;

export const highlighterReady = preloadHighlighter({
  themes: [...DECK_THEMES],
  langs: [...DECK_LANGS],
});
