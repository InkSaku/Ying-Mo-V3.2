import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const MAX_HIGHLIGHT_LENGTH = 50_000;
const LANGUAGE_CLASS_RE = /^language-([-\w+.]+)$/i;
const LANGUAGE_ALIASES = {
  c: "cpp",
  "c++": "cpp",
  h: "cpp",
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "bash",
};

for (const [name, grammar] of Object.entries({
  bash, cpp, css, java, javascript, json, markdown, python, rust, sql, typescript, xml, yaml,
})) {
  hljs.registerLanguage(name, grammar);
}

export function languageFromClass(className = "") {
  const match = LANGUAGE_CLASS_RE.exec(String(className).trim());
  if (!match) return "";
  const requested = match[1].toLowerCase();
  return LANGUAGE_ALIASES[requested] || requested;
}

export function highlightCode(code, className = "") {
  const source = String(code || "");
  const language = languageFromClass(className);
  if (!language || source.length > MAX_HIGHLIGHT_LENGTH || !hljs.getLanguage(language)) {
    return { highlighted: false, html: "", language };
  }
  try {
    return {
      highlighted: true,
      html: hljs.highlight(source, { language, ignoreIllegals: true }).value,
      language,
    };
  } catch {
    return { highlighted: false, html: "", language };
  }
}
