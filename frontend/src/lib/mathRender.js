import katex from "katex";

const KATEX_OPTIONS = {
  output: "htmlAndMathml",
  strict: "ignore",
  throwOnError: true,
  trust: false,
  maxExpand: 500,
  maxSize: 10,
};

export function renderMathExpression(expression, displayMode = false) {
  const source = String(expression || "").trim();
  if (!source || source.length > 5000) return { html: "", error: true };
  try {
    return {
      html: katex.renderToString(source, { ...KATEX_OPTIONS, displayMode }),
      error: false,
    };
  } catch {
    return { html: "", error: true };
  }
}
