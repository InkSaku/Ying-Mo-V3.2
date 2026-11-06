import { useEffect, useId, useMemo, useRef, useState } from "react";
import { highlightCode } from "../lib/codeHighlight";

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Older browsers and embedded views may still allow selection-based copy.
    }
  }

  const activeElement = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.style.cssText = "position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0;font-size:16px";
  document.body.append(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw new Error("Copy unavailable");
  } finally {
    textarea.remove();
    if (activeElement?.isConnected) activeElement.focus({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
}

export function ProtectedCodeBlock({ code, className = "" }) {
  const result = useMemo(() => highlightCode(code, className), [code, className]);
  const languageLabel = result.language || "text";
  const contentId = useId();
  const [feedback, setFeedback] = useState(null);
  const request = useRef(0);
  const resetTimer = useRef(null);
  const preRef = useRef(null);
  const status = feedback?.code === code ? feedback.status : "";

  useEffect(() => () => {
    request.current += 1;
    window.clearTimeout(resetTimer.current);
  }, []);

  const copy = async () => {
    if (status === "copying") return;
    const currentRequest = ++request.current;
    window.clearTimeout(resetTimer.current);
    setFeedback({ code, status: "copying" });
    try {
      await copyText(code);
      if (request.current !== currentRequest) return;
      setFeedback({ code, status: "copied" });
      resetTimer.current = window.setTimeout(() => setFeedback(null), 2500);
    } catch {
      if (request.current === currentRequest) setFeedback({ code, status: "error" });
    }
  };

  const selectCode = () => {
    const selection = window.getSelection();
    if (!selection || !preRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(preRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  return (
    <div className="highlighted-code-block">
      <div className="code-block-toolbar">
        <span className="code-block-language">{languageLabel}</span>
        <button type="button" className="code-block-copy" onClick={copy} disabled={status === "copying"} aria-controls={contentId} data-copied={status === "copied" || undefined}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {status === "copied" ? <path d="m4 10 4 4 8-8" /> : <><rect x="7" y="7" width="10" height="10" rx="1" /><path d="M12 4V3H3v9h1" /></>}
          </svg>
          {status === "copied" ? "已复制" : status === "copying" ? "复制中…" : "一键复制"}
        </button>
      </div>
      <span className="sr-only" role="status">{status === "copied" ? "文本块全部内容已复制" : ""}</span>
      {status === "error" ? <div className="code-block-copy-error" role="alert">复制失败，请重试或<button type="button" onClick={selectCode}>选中全文</button>后手动复制。</div> : null}
      <pre id={contentId} ref={preRef} tabIndex={0} aria-label={`${languageLabel} 文本内容，可横向滚动`}>
        {result.highlighted ? (
          <code
            className={`hljs ${className}`.trim()}
            // Highlight.js escapes source text before adding its own span tokens.
            dangerouslySetInnerHTML={{ __html: result.html }}
          />
        ) : <code className={className}>{code}</code>}
      </pre>
    </div>
  );
}
