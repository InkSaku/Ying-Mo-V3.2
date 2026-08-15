import { useMemo } from "react";
import "katex/dist/katex.min.css";
import { renderMathExpression } from "../lib/mathRender";

export function ProtectedMath({ expression, displayMode = false }) {
  const rendered = useMemo(
    () => renderMathExpression(expression, displayMode),
    [displayMode, expression],
  );
  const Tag = displayMode ? "div" : "span";

  if (rendered.error) {
    return (
      <code className={`math-render-error ${displayMode ? "math-block-error" : ""}`} title="公式语法无法渲染">
        {expression}
      </code>
    );
  }

  // KaTeX generates this markup with trust disabled and bounded expansion/size.
  return (
    <Tag
      className={`protected-math ${displayMode ? "math-block" : "math-inline"}`}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
