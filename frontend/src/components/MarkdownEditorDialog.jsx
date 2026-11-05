import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "../hooks/useModalDialog";
import { ProtectedMarkdown } from "./ProtectedMarkdown";
import { UploadProgress } from "./UploadProgress";
import { DismissibleDetails } from "./DismissibleDetails";
import { COMPACT_MARKDOWN_ACTIONS, formatActionLabel } from "../lib/markdownToolbar";
import { VisualMarkdownEditor } from "./VisualMarkdownEditor";
import { IMAGE_ACCEPT, IMAGE_FORMAT_LABEL } from "../lib/imageUpload";

function isSaveShortcut(event) {
  return !event.altKey
    && !event.shiftKey
    && (event.metaKey || event.ctrlKey)
    && String(event.key || "").toLowerCase() === "s";
}

export function MarkdownEditorDialog({
  open,
  postId,
  value,
  dirty,
  saving,
  uploading,
  uploadState,
  error,
  message,
  preview,
  media,
  textareaRef,
  shortcuts,
  interactionBlocked = false,
  onChange,
  onKeyDown,
  onFormat,
  onPrepareImagePicker,
  onUploadImages,
  onCancelUpload,
  onRetryUpload,
  onUpdateMedia,
  onSave,
  onSaveAndClose,
  onRequestClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mobileMode, setMobileMode] = useState("write");
  const [split, setSplit] = useState(50);
  const [draggingImage, setDraggingImage] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMobileMode("write");
    setDraggingImage(false);
  }, [open]);
  const backdropProps = useModalDialog({ open, panelRef, onClose: onRequestClose, busy: saving || uploading,
    blocked: interactionBlocked, initialFocus: () => textareaRef.current,
    onKeyDown: (event) => {
      if (isSaveShortcut(event)) {
        event.preventDefault();
        if (!saving && !uploading) onSave();
      }
    } });

  if (!open) return null;

  const busy = saving || uploading;
  const uploadFiles = async (files, options) => {
    const images = Array.from(files || []);
    if (!images.length) return;
    await onUploadImages(images, options);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startResize = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const bounds = panel.querySelector(".markdown-editor-workspace")?.getBoundingClientRect();
    if (!bounds) return;

    const update = (pointerEvent) => {
      const percentage = ((pointerEvent.clientX - bounds.left) / bounds.width) * 100;
      setSplit(Math.min(68, Math.max(32, percentage)));
    };
    const stop = () => {
      document.removeEventListener("pointermove", update);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
    };
    document.addEventListener("pointermove", update);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
  };

  const resizeWithKeyboard = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setSplit((current) => Math.min(68, Math.max(32, current + (event.key === "ArrowRight" ? 2 : -2))));
  };

  return createPortal(
    <div className="markdown-editor-backdrop" {...backdropProps}>
      <section
        ref={panelRef}
        className="markdown-editor-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={(event) => {
          // ProseMirror consumes Escape for node selection; the modal still owns dismissal.
          if (event.key !== "Escape" || interactionBlocked || !event.target.closest(".rich-markdown-content")) return;
          event.preventDefault();
          event.stopPropagation();
          if (!busy) onRequestClose();
        }}
      >
        <header className="markdown-editor-dialog-header">
          <div>
            <p className="hero-kicker">沉浸式编辑</p>
            <h2 id={titleId}>Markdown 正文</h2>
            <p id={descriptionId}>左侧编写，右侧呈现与发布页面一致的预览。</p>
          </div>
          <div className="markdown-editor-header-actions">
            <span className={`markdown-editor-dirty-state ${dirty ? "is-dirty" : ""}`} role="status">
              {saving ? "正在保存…" : uploading ? "正在上传图片…" : dirty ? "有未保存修改" : "当前无新修改"}
            </span>
            <button className="markdown-editor-close" type="button" aria-label="关闭正文编辑器" disabled={busy} onClick={onRequestClose}>×</button>
          </div>
        </header>

        <div className="markdown-editor-mobile-tabs" role="tablist" aria-label="正文编辑模式">
          <button type="button" role="tab" aria-selected={mobileMode === "write"} className={mobileMode === "write" ? "active" : ""} onClick={() => setMobileMode("write")}>编辑</button>
          <button type="button" role="tab" aria-selected={mobileMode === "preview"} className={mobileMode === "preview" ? "active" : ""} onClick={() => setMobileMode("preview")}>预览</button>
        </div>

        <div className="markdown-shortcut-toolbar markdown-editor-shortcuts" role="toolbar" aria-label="Markdown 快捷操作">
          {shortcuts.map((item) => (
            <button
              key={item.action}
              className={`markdown-shortcut-button${COMPACT_MARKDOWN_ACTIONS.has(item.action) ? "" : " editor-secondary-format"}`}
              type="button"
              title={item.hint}
              aria-label={`${item.label}：${item.hint}`}
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onFormat(item.action)}
            >
              {item.label}
            </button>
          ))}
          <button
            className="markdown-shortcut-button markdown-editor-image-picker"
            type="button"
            disabled={busy}
            aria-label="插入图片"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onPrepareImagePicker?.();
              fileInputRef.current?.click();
            }}
          >
            {uploading ? "上传中" : "插入图片"}
          </button>
          <DismissibleDetails className="editor-more-formats markdown-editor-more-formats">
            <summary>更多 <span aria-hidden="true">⌄</span></summary>
            <div>{shortcuts.filter((item) => !COMPACT_MARKDOWN_ACTIONS.has(item.action)).map((item) => <button key={item.action} type="button" disabled={busy} title={item.hint} onMouseDown={(event) => event.preventDefault()} onClick={(event) => {
              onFormat(item.action);
              event.currentTarget.closest("details").open = false;
            }}>{formatActionLabel(item)}</button>)}</div>
          </DismissibleDetails>
          <input
            ref={fileInputRef}
            className="markdown-editor-file-input"
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            disabled={busy}
            tabIndex="-1"
            onChange={(event) => uploadFiles(event.target.files, { selectionPrepared: true })}
          />
        </div>

        <div className="markdown-editor-feedback-slot">
          {error ? <div className="inline-error markdown-editor-feedback" role="alert">{error}</div> : null}
          {message ? <div className="inline-success markdown-editor-feedback" role="status">{message}</div> : null}
          <UploadProgress state={uploadState} onCancel={onCancelUpload} onRetry={onRetryUpload} compact />
        </div>

        <div
          className="markdown-editor-workspace"
          style={{ "--markdown-editor-split": `${split}%` }}
        >
          <section className={`markdown-editor-pane markdown-editor-write-pane ${mobileMode === "write" ? "is-mobile-active" : ""}`} aria-label="Markdown 编辑区">
            <div
              className={`markdown-editor-textarea-wrap ${draggingImage ? "is-dragging" : ""}`}
              onDragEnter={(event) => {
                if (event.dataTransfer?.types?.includes("Files")) setDraggingImage(true);
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer?.types?.includes("Files")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDraggingImage(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setDraggingImage(false);
              }}
              onDrop={(event) => {
                const files = Array.from(event.dataTransfer?.files || []);
                if (!files.length) return;
                event.preventDefault();
                setDraggingImage(false);
                uploadFiles(files);
              }}
            >
              <VisualMarkdownEditor
                showSourcePreview={false}
                postId={postId}
                ref={textareaRef}
                className="markdown-editor-visual"
                value={value}
                media={media}
                management
                spellCheck
                onChange={onChange}
                onKeyDown={onKeyDown}
                onUpdateMedia={onUpdateMedia}
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData?.items || [])
                    .filter((item) => item.kind === "file")
                    .map((item) => item.getAsFile())
                    .filter(Boolean);
                  if (!files.length) return;
                  event.preventDefault();
                  uploadFiles(files);
                }}
                placeholder="在这里编写 Markdown 正文。也可以拖入图片或直接粘贴截图。"
                ariaLabel="Markdown 正文"
              />
              <div className="markdown-editor-drop-hint" aria-hidden={!draggingImage}>松开即可上传并插入图片</div>
            </div>
          </section>

          <div
            className="markdown-editor-resizer"
            role="separator"
            tabIndex="0"
            aria-label="调整编辑和预览区域宽度"
            aria-orientation="vertical"
            aria-valuemin="32"
            aria-valuemax="68"
            aria-valuenow={Math.round(split)}
            onPointerDown={startResize}
            onKeyDown={resizeWithKeyboard}
          ><span /></div>

          <section className={`markdown-editor-pane markdown-editor-preview-pane ${mobileMode === "preview" ? "is-mobile-active" : ""}`} aria-label="Markdown 实时预览" aria-live="polite">
            {preview.error ? <div className="inline-error" role="alert">{preview.error}</div> : null}
            {preview.html ? (
              <ProtectedMarkdown
                html={preview.html}
                media={media}
                management
                className="prose markdown-editor-preview-prose"
              />
            ) : null}
            {!preview.error && !preview.html ? (
              <p className="markdown-editor-preview-state">{preview.loading ? "正在生成预览…" : "正文为空，暂无可预览内容。"}</p>
            ) : null}
            {preview.loading && preview.html ? <span className="markdown-editor-preview-updating">正在更新预览…</span> : null}
          </section>
        </div>

        <footer className="markdown-editor-dialog-footer">
          <p>支持拖拽或粘贴 {IMAGE_FORMAT_LABEL}；大图会先在本机优化，取消编辑不会删除已经上传的媒体。</p>
          <div>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={onRequestClose}>取消</button>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={onSave} title="⌘/Ctrl + S">保存</button>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={onSaveAndClose}>保存并关闭</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
