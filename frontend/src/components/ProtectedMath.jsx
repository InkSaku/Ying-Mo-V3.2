import { useLayoutEffect, useMemo, useRef } from "react";
import "katex/dist/katex.min.css";
import { renderMathExpression } from "../lib/mathRender";

const TAG_GAP_PX = 12;

export function ProtectedMath({ expression, displayMode = false }) {
  const rendered = useMemo(
    () => renderMathExpression(expression, displayMode),
    [displayMode, expression],
  );
  const blockRef = useRef(null);
  const Tag = displayMode ? "div" : "span";

  // KaTeX 的编号绝对定位、不占宽度，公式居中后两侧放不下编号时才让它让开。
  useLayoutEffect(() => {
    const block = blockRef.current;
    const tag = block?.querySelector(".katex-html > .katex-tag");
    const bases = block?.querySelectorAll(".katex-html > .katex-base");
    if (!tag || !bases?.length) return undefined;

    const display = block.querySelector(".katex-display");
    const first = bases[0];
    const last = bases[bases.length - 1];
    const update = () => {
      const formulaWidth = last.offsetLeft + last.offsetWidth - first.offsetLeft;
      const sideSpace = (display.clientWidth - formulaWidth) / 2;
      block.classList.toggle("math-tag-clear", sideSpace < tag.offsetWidth + TAG_GAP_PX);
    };

    update();
    // 公式字体晚于首屏加载时宽度会变，所以公式本身也要观察。
    const observer = new ResizeObserver(update);
    observer.observe(display);
    bases.forEach((base) => observer.observe(base));
    return () => observer.disconnect();
  }, [rendered.html]);

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
      ref={blockRef}
      className={`protected-math ${displayMode ? "math-block" : "math-inline"}`}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
