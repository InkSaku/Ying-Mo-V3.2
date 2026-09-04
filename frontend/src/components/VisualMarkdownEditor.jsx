import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { removeMediaPlaceholders } from "../lib/internalMedia";
import { manageableMediaRows, mediaPresentation } from "../lib/postMedia";
import {
  mediaOrder,
  reorderMediaPlaceholders,
  replaceVisualTextBlock,
  visualMarkdownBlocks,
} from "../lib/visualMarkdown";
import { MediaPresentationEditor } from "./MediaPresentationEditor";
import { ProtectedImage } from "./ProtectedImage";

function emitValue(onChange, value) {
  onChange?.({ target: { value } });
}

function previewPath(media, management) {
  if (!media) return null;
  if (management) return media.manage_thumbnail_path || media.thumbnail_path || media.manage_path || media.read_path;
  return media.thumbnail_path || media.read_path;
}

export const VisualMarkdownEditor = forwardRef(function VisualMarkdownEditor({
  value,
  media = [],
  management = false,
  className = "",
  placeholder = "",
  ariaLabel = "正文",
  ariaDescribedBy,
  spellCheck = true,
  onChange,
  onKeyDown,
  onPaste,
  onUpdateMedia,
}, ref) {
  const source = String(value || "");
  const blocks = useMemo(() => visualMarkdownBlocks(source), [source]);
  const rows = useMemo(() => manageableMediaRows(media), [media]);
  const mediaMap = useMemo(() => new Map(rows.map((row) => [Number(row.primary.id), row])), [rows]);
  const mediaIds = useMemo(() => mediaOrder(source), [source]);
  const textareasRef = useRef(new Map());
  const blocksRef = useRef(blocks);
  const selectionRef = useRef([source.length, source.length]);
  const activeTextKeyRef = useRef(null);
  const rawTextareaRef = useRef(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [draggingMediaId, setDraggingMediaId] = useState(null);
  const [editingMediaId, setEditingMediaId] = useState(null);
  const [savingMediaId, setSavingMediaId] = useState(null);
  blocksRef.current = blocks;

  const syncSelection = (block, element) => {
    const start = block.start + element.selectionStart;
    const end = block.start + element.selectionEnd;
    selectionRef.current = [start, end];
    activeTextKeyRef.current = block.key;
  };

  const focusSelection = (start, end = start) => {
    const safeStart = Math.max(0, Math.min(Number(start) || 0, source.length));
    const safeEnd = Math.max(safeStart, Math.min(Number(end) || safeStart, source.length));
    selectionRef.current = [safeStart, safeEnd];
    if (sourceMode && rawTextareaRef.current) {
      rawTextareaRef.current.focus();
      rawTextareaRef.current.setSelectionRange(safeStart, safeEnd);
      return;
    }

    const textBlocks = blocksRef.current.filter((block) => block.type === "text");
    const target = textBlocks.find((block) => safeStart >= block.start && safeStart <= block.end)
      || [...textBlocks].reverse().find((block) => block.end <= safeStart)
      || textBlocks[0];
    const element = target ? textareasRef.current.get(target.key) : null;
    if (!target || !element) return;
    const localStart = Math.max(0, Math.min(safeStart - target.start, target.value.length));
    const localEnd = Math.max(localStart, Math.min(safeEnd - target.start, target.value.length));
    element.focus();
    element.setSelectionRange(localStart, localEnd);
    activeTextKeyRef.current = target.key;
  };

  useImperativeHandle(ref, () => ({
    focus() {
      if (sourceMode && rawTextareaRef.current) {
        rawTextareaRef.current.focus();
        return;
      }
      const active = textareasRef.current.get(activeTextKeyRef.current);
      const fallback = blocksRef.current.find((block) => block.type === "text");
      (active || textareasRef.current.get(fallback?.key))?.focus();
    },
    get selectionStart() {
      return sourceMode && rawTextareaRef.current
        ? rawTextareaRef.current.selectionStart
        : selectionRef.current[0];
    },
    get selectionEnd() {
      return sourceMode && rawTextareaRef.current
        ? rawTextareaRef.current.selectionEnd
        : selectionRef.current[1];
    },
    setSelectionRange(start, end) {
      focusSelection(start, end);
    },
  }));

  const updateTextBlock = (block, event) => {
    const nextValue = replaceVisualTextBlock(source, block, event.target.value);
    const nextStart = block.start + event.target.selectionStart;
    const nextEnd = block.start + event.target.selectionEnd;
    selectionRef.current = [nextStart, nextEnd];
    activeTextKeyRef.current = block.key;
    emitValue(onChange, nextValue);
  };

  const moveMedia = (mediaId, direction) => {
    const index = mediaIds.indexOf(mediaId);
    const target = mediaIds[index + direction];
    if (!target) return;
    emitValue(onChange, reorderMediaPlaceholders(source, mediaId, target));
  };

  const saveMedia = async (mediaId, data) => {
    if (!onUpdateMedia) return;
    setSavingMediaId(mediaId);
    try {
      await onUpdateMedia(mediaId, data);
      setEditingMediaId(null);
    } finally {
      setSavingMediaId(null);
    }
  };

  return (
    <div className={`visual-markdown-editor ${className}`}>
      <div className="visual-markdown-mode-switch" role="group" aria-label="正文编辑显示模式">
        <button type="button" aria-pressed={!sourceMode} onClick={() => setSourceMode(false)}>可视编辑</button>
        <button type="button" aria-pressed={sourceMode} onClick={() => setSourceMode(true)}>Markdown 源码</button>
      </div>
      {sourceMode ? (
        <textarea
          ref={rawTextareaRef}
          className="visual-markdown-source"
          value={source}
          spellCheck={spellCheck}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSelect={(event) => { selectionRef.current = [event.currentTarget.selectionStart, event.currentTarget.selectionEnd]; }}
          placeholder={placeholder}
          aria-label={`${ariaLabel} Markdown 源码`}
          aria-describedby={ariaDescribedBy}
        />
      ) : (
        <div className="visual-markdown-blocks" aria-label={`${ariaLabel}可视编辑区`}>
          {blocks.map((block, index) => {
            if (block.type === "text") {
              const onlyText = blocks.length === 1;
              const rowsCount = Math.max(onlyText ? 12 : 3, Math.min(24, block.value.split("\n").length + 2));
              return (
                <textarea
                  key={block.key}
                  ref={(element) => {
                    if (element) textareasRef.current.set(block.key, element);
                    else textareasRef.current.delete(block.key);
                  }}
                  className="visual-markdown-text-block"
                  value={block.value}
                  rows={rowsCount}
                  spellCheck={spellCheck}
                  onChange={(event) => updateTextBlock(block, event)}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  onFocus={(event) => syncSelection(block, event.currentTarget)}
                  onSelect={(event) => syncSelection(block, event.currentTarget)}
                  placeholder={block.value ? "" : index === 0 ? placeholder : "在图片前后继续写……"}
                  aria-label={onlyText ? ariaLabel : `${ariaLabel}文字段 ${Math.floor(index / 2) + 1}`}
                  aria-describedby={ariaDescribedBy}
                />
              );
            }

            const row = mediaMap.get(block.mediaId);
            const image = row?.primary;
            const presentation = mediaPresentation(image);
            const mediaPosition = mediaIds.indexOf(block.mediaId);
            return (
              <figure
                key={block.key}
                className={`visual-media-block media-size-${presentation.display_size} media-align-${presentation.alignment} ${draggingMediaId === block.mediaId ? "is-dragging" : ""}`}
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/x-yingmo-media", String(block.mediaId));
                  setDraggingMediaId(block.mediaId);
                }}
                onDragEnd={() => setDraggingMediaId(null)}
                onDragOver={(event) => {
                  if (!draggingMediaId || draggingMediaId === block.mediaId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const sourceId = Number(event.dataTransfer.getData("text/x-yingmo-media")) || draggingMediaId;
                  setDraggingMediaId(null);
                  emitValue(onChange, reorderMediaPlaceholders(source, sourceId, block.mediaId));
                }}
              >
                <div className="visual-media-block-toolbar">
                  <span aria-label="拖动图片调整位置">⋮⋮ 图片 {mediaPosition + 1}</span>
                  <div>
                    <button type="button" disabled={mediaPosition <= 0} onClick={() => moveMedia(block.mediaId, -1)}>上移</button>
                    <button type="button" disabled={mediaPosition >= mediaIds.length - 1} onClick={() => moveMedia(block.mediaId, 1)}>下移</button>
                    {onUpdateMedia && image ? <button type="button" aria-expanded={editingMediaId === block.mediaId} onClick={() => setEditingMediaId((current) => current === block.mediaId ? null : block.mediaId)}>图片设置</button> : null}
                    <button type="button" onClick={() => emitValue(onChange, removeMediaPlaceholders(source, [block.mediaId]))}>从正文移除</button>
                  </div>
                </div>
                {image ? (
                  <ProtectedImage
                    path={previewPath(image, management)}
                    alt={image.alt_text || ""}
                    className="visual-media-block-image"
                  />
                ) : <div className="visual-media-block-missing">媒体 #{block.mediaId} 暂时不可用</div>}
                {image?.caption ? <figcaption>{image.caption}</figcaption> : null}
                {editingMediaId === block.mediaId && image ? (
                  <MediaPresentationEditor
                    media={image}
                    busy={savingMediaId === block.mediaId}
                    compact
                    onSave={(data) => saveMedia(block.mediaId, data)}
                    onCancel={() => setEditingMediaId(null)}
                  />
                ) : null}
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
});
