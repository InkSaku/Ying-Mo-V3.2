import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { normalizeReactions, optimisticReaction } from "../lib/reactions";

export function ReactionPicker({ initialState, readPath, writePath, compact = false }) {
  const mounted = useRef(true);
  const [state, setState] = useState(() => normalizeReactions(initialState));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    setState(normalizeReactions(initialState));
    setBusy(false);
    setError("");
    return () => { mounted.current = false; };
  }, [initialState, readPath]);

  const choose = async (kind) => {
    if (busy) return;
    const previous = state;
    const optimistic = optimisticReaction(previous, kind);
    setState(optimistic);
    setBusy(true);
    setError("");
    try {
      const result = await api.put(writePath, { kind: optimistic.selected });
      if (mounted.current) setState(normalizeReactions(result.data));
    } catch (actionError) {
      if (!mounted.current) return;
      try {
        const result = await api.get(readPath);
        if (mounted.current) setState(normalizeReactions(result.data));
      } catch {
        if (mounted.current) setState(previous);
      }
      if (mounted.current) setError(`回应失败：${actionError.message}`);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className={`reaction-picker ${compact ? "reaction-picker-compact" : ""}`} aria-label="表情回应" aria-busy={busy || undefined}>
      <div className="reaction-options">
        {state.items.map((item) => (
          <button
            key={item.kind}
            className={state.selected === item.kind ? "selected" : ""}
            type="button"
            disabled={busy}
            aria-pressed={state.selected === item.kind}
            aria-label={`${item.label}，当前 ${item.count} 人`}
            title={item.label}
            onClick={() => { void choose(item.kind); }}
          >
            <span aria-hidden="true">{item.emoji}</span>
            {item.count ? <span className="tabular">{item.count}</span> : null}
          </button>
        ))}
      </div>
      {error ? <p className="reaction-error" role="alert">{error}</p> : null}
    </div>
  );
}
