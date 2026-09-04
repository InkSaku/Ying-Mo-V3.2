import { useEffect, useState } from "react";
import { mediaPresentation } from "../lib/postMedia";

const sizeOptions = [
  ["small", "小"],
  ["medium", "中"],
  ["large", "大"],
  ["full", "通栏"],
];
const alignmentOptions = [
  ["left", "左"],
  ["center", "中"],
  ["right", "右"],
];

export function MediaPresentationEditor({ media, busy = false, onSave, onCancel, compact = false }) {
  const [draft, setDraft] = useState(() => mediaPresentation(media));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(mediaPresentation(media));
    setError("");
  }, [media]);

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setError("");
    try {
      await onSave({
        alt_text: draft.alt_text.trim() || null,
        caption: draft.caption.trim() || null,
        display_size: draft.display_size,
        alignment: draft.alignment,
      });
    } catch (saveError) {
      setError(saveError.message || "图片设置保存失败，请重试。");
    }
  };

  return (
    <div className={`media-presentation-editor ${compact ? "is-compact" : ""}`}>
      <label>
        <span>图片说明（ALT）</span>
        <input
          maxLength={300}
          value={draft.alt_text}
          onChange={(event) => update("alt_text", event.target.value)}
          placeholder="描述图片内容，供读屏软件使用"
        />
      </label>
      <label>
        <span>可见图注</span>
        <textarea
          maxLength={500}
          value={draft.caption}
          onChange={(event) => update("caption", event.target.value)}
          placeholder="显示在图片下方，可留空"
        />
      </label>
      <div className="media-presentation-options">
        <fieldset>
          <legend>尺寸</legend>
          <div>
            {sizeOptions.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={draft.display_size === value} onClick={() => update("display_size", value)}>{label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={draft.display_size === "full"}>
          <legend>对齐</legend>
          <div>
            {alignmentOptions.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={draft.alignment === value} onClick={() => update("alignment", value)}>{label}</button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="media-presentation-actions">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => { void submit(); }}>{busy ? "正在保存" : "保存图片设置"}</button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCancel}>取消</button>
      </div>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </div>
  );
}
