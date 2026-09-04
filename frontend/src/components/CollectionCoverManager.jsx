import { useRef, useState } from "react";
import { api } from "../lib/api";
import { IMAGE_ACCEPT, isAcceptedImageFile, prepareImageForUpload } from "../lib/imageUpload";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProtectedImage } from "./ProtectedImage";
import { UploadProgress } from "./UploadProgress";

export function CollectionCoverManager({ collection, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadState, setUploadState] = useState(null);
  const [retryFile, setRetryFile] = useState(null);
  const uploadAbortRef = useRef(null);

  const runUpload = async (file) => {
    setError("");
    setMessage("");
    if (!isAcceptedImageFile(file)) {
      setError("请选择 JPEG、PNG、WebP、HEIC 或 HEIF 图片。");
      return;
    }
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setRetryFile(null);
    setUploadState({ status: "optimizing", stage: "正在检查图片", percent: 0, currentFile: 1, totalFiles: 1, fileName: file.name });
    setBusy(true);
    try {
      const prepared = await prepareImageForUpload(file, {
        signal: controller.signal,
        onStage: (stage) => setUploadState((current) => ({ ...current, status: "optimizing", stage, percent: 0 })),
      });
      const body = new FormData();
      body.append("file", prepared.file);
      const uploaded = await api.upload("/uploads/images", body, {
        signal: controller.signal,
        onProgress: ({ percent }) => setUploadState((current) => ({ ...current, status: "uploading", stage: "正在上传", percent })),
      });
      const previousCoverId = collection.cover_media_id;
      const updated = await api.patch(`/collections/${collection.id}`, { cover_media_id: uploaded.data.id });
      let cleanupFailed = false;
      if (previousCoverId && previousCoverId !== uploaded.data.id) {
        try {
          await api.delete(`/uploads/${previousCoverId}/bind`);
        } catch {
          cleanupFailed = true;
        }
      }
      await onChange(updated.data);
      setUploadState(null);
      setMessage(cleanupFailed ? "封面已替换，但旧媒体解绑失败，请刷新后重试。" : "Collection 封面已更新。");
    } catch (uploadError) {
      const cancelled = uploadError.code === "REQUEST_ABORTED" || uploadError.name === "AbortError";
      setError(cancelled ? "封面上传已取消。" : uploadError.message);
      setUploadState((current) => ({ ...current, status: cancelled ? "cancelled" : "error", stage: cancelled ? "上传已取消" : "上传失败" }));
      setRetryFile(file);
    } finally {
      uploadAbortRef.current = null;
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const upload = (event) => {
    const file = event.target.files?.[0];
    if (file) void runUpload(file);
  };

  const remove = async () => {
    if (!collection.cover_media_id) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.delete(`/uploads/${collection.cover_media_id}/bind`);
      await onChange({ ...collection, cover_media_id: null, cover_media: null });
      setConfirmRemove(false);
      setMessage("Collection 封面已移除。");
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="collection-cover-manager" aria-labelledby="collection-cover-heading">
      <div>
        <h2 id="collection-cover-heading">封面</h2>
        <p>封面只对当前 Collection 成员可读。</p>
      </div>
      {collection.cover_media ? (
        <ProtectedImage media={collection.cover_media} alt="当前 Collection 封面" className="collection-cover-preview" />
      ) : <div className="collection-cover-empty">尚未设置封面</div>}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}
      <UploadProgress state={uploadState} onCancel={() => uploadAbortRef.current?.abort()} onRetry={retryFile ? () => { void runUpload(retryFile); } : null} compact />
      <div className="collection-cover-actions">
        <label className={`btn btn-secondary file-picker ${busy ? "is-disabled" : ""}`} aria-disabled={busy}>
          {busy ? "正在处理" : collection.cover_media_id ? "替换封面" : "上传封面"}
          <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} disabled={busy} onChange={upload} />
        </label>
        {collection.cover_media_id ? <button className="text-button danger-text" type="button" disabled={busy} onClick={() => setConfirmRemove(true)}>移除封面</button> : null}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="移除 Collection 封面？"
        description="封面媒体会与 Collection 解除绑定，其他内容和成员关系不受影响。"
        confirmLabel="确认移除"
        danger
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </section>
  );
}
