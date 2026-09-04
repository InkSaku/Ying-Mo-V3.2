import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { IMAGE_ACCEPT, isAcceptedImageFile, prepareImageForUpload } from "../lib/imageUpload";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProtectedImage } from "./ProtectedImage";
import { UploadProgress } from "./UploadProgress";

const maxBytes = 15 * 1024 * 1024;

export function AvatarManager({ profile, onChange }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadState, setUploadState] = useState(null);
  const [retryFile, setRetryFile] = useState(null);
  const uploadAbortRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clearSelection = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const choose = (event) => {
    const selected = event.target.files?.[0] || null;
    setError("");
    setMessage("");
    if (!selected) {
      clearSelection();
      return;
    }
    if (!isAcceptedImageFile(selected)) {
      setError("请选择 JPEG、PNG、WebP、HEIC 或 HEIF 图片。");
      clearSelection();
      return;
    }
    if (selected.size > maxBytes) {
      setError("头像图片不得超过 15 MB。");
      clearSelection();
      return;
    }
    setFile(selected);
  };

  const save = async (fileOverride = null) => {
    const selectedFile = fileOverride || file;
    if (!selectedFile) return;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setRetryFile(null);
    setUploadState({ status: "optimizing", stage: "正在检查图片", percent: 0, currentFile: 1, totalFiles: 1, fileName: selectedFile.name });
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const prepared = await prepareImageForUpload(selectedFile, {
        signal: controller.signal,
        onStage: (stage) => setUploadState((current) => ({ ...current, status: "optimizing", stage, percent: 0 })),
      });
      const body = new FormData();
      body.append("file", prepared.file);
      const uploaded = await api.upload("/uploads/images", body, {
        signal: controller.signal,
        onProgress: ({ percent }) => setUploadState((current) => ({ ...current, status: "uploading", stage: "正在上传", percent })),
      });
      const previousId = profile.avatar_media_id;
      const updated = await api.patch("/users/me", { avatar_media_id: uploaded.data.id });
      let cleanupFailed = false;
      if (previousId && previousId !== uploaded.data.id) {
        try {
          await api.delete(`/uploads/${previousId}/bind`);
        } catch {
          cleanupFailed = true;
        }
      }
      await onChange(updated.data);
      clearSelection();
      setUploadState(null);
      setMessage(cleanupFailed
        ? "新头像已生效，但旧媒体解绑失败；当前头像不受影响。"
        : previousId ? "头像已替换。" : "头像已设置。");
    } catch (saveError) {
      const cancelled = saveError.code === "REQUEST_ABORTED" || saveError.name === "AbortError";
      setError(cancelled ? "头像上传已取消。" : saveError.message);
      setUploadState((current) => ({ ...current, status: cancelled ? "cancelled" : "error", stage: cancelled ? "上传已取消" : "上传失败" }));
      setRetryFile(selectedFile);
    } finally {
      uploadAbortRef.current = null;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!profile.avatar_media_id) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.delete(`/uploads/${profile.avatar_media_id}/bind`);
      const updated = await api.patch("/users/me", { avatar_media_id: null });
      await onChange(updated.data);
      clearSelection();
      setConfirmRemove(false);
      setMessage("头像已移除，成员页面将显示昵称首字占位。");
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  const fallbackText = (profile.nickname || profile.username || "?").slice(0, 1);

  return (
    <section className="avatar-manager" aria-labelledby="avatar-manager-heading">
      <div className="avatar-manager-heading">
        <div>
          <h2 id="avatar-manager-heading">头像</h2>
          <p>头像只通过鉴权媒体接口读取。选择图片后需要再次确认才会保存。</p>
        </div>
      </div>

      <div className="avatar-preview-grid">
        <div className="avatar-preview-item">
          <span>当前头像</span>
          {profile.avatar_media ? (
            <ProtectedImage media={profile.avatar_media} alt="当前头像" className="avatar-settings-preview" />
          ) : (
            <div className="avatar-settings-placeholder" aria-label="尚未设置头像">{fallbackText}</div>
          )}
        </div>
        {previewUrl ? (
          <div className="avatar-preview-item">
            <span>待确认预览</span>
            <img src={previewUrl} alt="待确认的新头像预览" className="avatar-settings-preview" />
          </div>
        ) : null}
      </div>

      {file ? <p className="avatar-file-meta">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}
      <UploadProgress
        state={uploadState}
        onCancel={() => uploadAbortRef.current?.abort()}
        onRetry={retryFile ? () => { void save(retryFile); } : null}
        compact
      />

      <div className="avatar-manager-actions">
        {!file ? (
          <label className={`btn btn-secondary file-picker ${busy ? "is-disabled" : ""}`} aria-disabled={busy}>
            {profile.avatar_media_id ? "选择替换图片" : "选择头像图片"}
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={busy}
              onChange={choose}
            />
          </label>
        ) : (
          <>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
              {busy ? "正在上传" : profile.avatar_media_id ? "确认替换头像" : "确认设置头像"}
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => {
              clearSelection();
              setError("");
            }}>
              取消选择
            </button>
          </>
        )}
        {profile.avatar_media_id ? (
          <button className="text-button danger-text" type="button" disabled={busy} onClick={() => setConfirmRemove(true)}>
            移除头像
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="移除当前头像？"
        description="头像媒体会与你的账户解除绑定；个人中心和用户主页将改为昵称首字占位。"
        confirmLabel="确认移除"
        danger
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </section>
  );
}
