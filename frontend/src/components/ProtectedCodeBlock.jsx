import { useMemo } from "react";
import { highlightCode } from "../lib/codeHighlight";

export function ProtectedCodeBlock({ code, className = "" }) {
  const result = useMemo(() => highlightCode(code, className), [code, className]);
  const languageLabel = result.language || "code";

  return (
    <pre className="highlighted-code-block" data-language={languageLabel}>
      {result.highlighted ? (
        <code
          className={`hljs ${className}`.trim()}
          // Highlight.js escapes source text before adding its own span tokens.
          dangerouslySetInnerHTML={{ __html: result.html }}
        />
      ) : <code className={className}>{code}</code>}
    </pre>
  );
}
