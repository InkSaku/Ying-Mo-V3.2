import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { IMAGE_ACCEPT, isAcceptedImageFile, prepareImageForUpload } from "../lib/imageUpload";
import { manageableMediaRows } from "../lib/postMedia";
import { ConfirmDialog } from "./ConfirmDialog";
import { MediaPresentationEditor } from "./MediaPresentationEditor";
import { ProtectedImage } from "./ProtectedImage";
import { UploadProgress } from "./UploadProgress";

export const PostMediaManager = forwardRef(function PostMediaManager({
  post,
  ensurePost,
  onPostChange,
  onPrepareInsert,
  onInsertMedia,
  onRemoveMedia,
  inlineMediaIds = new Set(),
}, ref) {
  const imageInputRef = useRef(null);
  const liveImageInputRef = useRef(null);
  const liveVideoInputRef = useRef(null);
  const busyRef = useRef(false);
  const activeUploadRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [liveImage, setLiveImage] = useState(null);
  const [liveVideo, setLiveVideo] = useState(null);
  const [editingMediaId, setEditingMediaId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [uploadState, setUploadState] = useState(null);
  const [retryUpload, setRetryUpload] = useState(null);
  const rows = useMemo(() => manageableMediaRows(post?.bound_media || []), [post?.bound_media]);

  const refreshPost = async (postId) => {
    const result = await api.get(`/posts/me/${postId}`);
    onPostChange(result.data);
    return result.data;
  };

  const uploadImageFile = async (file, {
    insertIntoBody = true,
    rethrow = false,
    postOverride = null,
    signal,
    onProgress,
    onStage,
  } = {}) => {
    if (!file || busyRef.current) return null;
    setError("");
    setMessage("");
    if (!isAcceptedImageFile(file)) {
      setError("请选择 JPEG、PNG、WebP、HEIC 或 HEIF 图片。");
      return null;
    }

    busyRef.current = true;
    setBusy("image");
    try {
      const currentPost = postOverride || await ensurePost();
      if (!currentPost) return null;
      const prepared = await prepareImageForUpload(file, { signal, onStage });
      const body = new FormData();
      body.append("file", prepared.file);
      const uploaded = await api.upload("/uploads/images", body, { signal, onProgress });
      await api.post(`/uploads/${uploaded.data.id}/bind`, { bound_type: "post", bound_id: currentPost.id });
      await refreshPost(currentPost.id);
      if (insertIntoBody) await onInsertMedia?.(uploaded.data.id);
      setMessage(insertIntoBody
        ? "图片已上传、插入正文并保存。"
        : "图片已上传并绑定到当前内容。");
      return uploaded.data;
    } catch (uploadError) {
      setError(uploadError.message);
      if (rethrow) throw uploadError;
      return null;
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  useImperativeHandle(ref, () => ({ uploadImageFile }));

  const runImageUpload = async (file) => {
    const controller = new AbortController();
    activeUploadRef.current = controller;
    setRetryUpload(null);
    setUploadState({ status: "optimizing", stage: "正在检查图片", percent: 0, currentFile: 1, totalFiles: 1, fileName: file.name });
    try {
      await uploadImageFile(file, {
        insertIntoBody: true,
        rethrow: true,
        signal: controller.signal,
        onStage: (stage) => setUploadState((current) => ({ ...current, status: "optimizing", stage, percent: 0 })),
        onProgress: ({ percent }) => setUploadState((current) => ({ ...current, status: "uploading", stage: "正在上传", percent })),
      });
      setUploadState(null);
    } catch (uploadError) {
      const cancelled = uploadError.code === "REQUEST_ABORTED" || uploadError.name === "AbortError";
      setUploadState((current) => ({ ...current, status: cancelled ? "cancelled" : "error", stage: cancelled ? "上传已取消" : "上传失败" }));
      setRetryUpload({ kind: "image", file });
    } finally {
      activeUploadRef.current = null;
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const uploadImage = (event) => {
    const file = event.target.files?.[0];
    if (file) void runImageUpload(file);
  };

  const uploadLivePhoto = async ({ image: imageOverride, video: videoOverride } = {}) => {
    const imageFile = imageOverride || liveImage;
    const videoFile = videoOverride || liveVideo;
    setError("");
    setMessage("");
    if (!imageFile || !videoFile) {
      setError("请同时选择 Live Photo 的图片和视频文件。");
      return;
    }
    if (!isAcceptedImageFile(imageFile)) {
      setError("Live Photo 图片必须是 JPEG、PNG、WebP、HEIC 或 HEIF。");
      return;
    }
    if (busyRef.current) return;

    onPrepareInsert?.();
    const controller = new AbortController();
    activeUploadRef.current = controller;
    setRetryUpload(null);
    setUploadState({ status: "optimizing", stage: "正在检查静态图片", percent: 0, currentFile: 1, totalFiles: 1, fileName: imageFile.name });
    busyRef.current = true;
    setBusy("live");
    try {
      const currentPost = await ensurePost();
      if (!currentPost) {
        setUploadState(null);
        return;
      }
      const prepared = await prepareImageForUpload(imageFile, {
        signal: controller.signal,
        onStage: (stage) => setUploadState((current) => ({ ...current, status: "optimizing", stage, percent: 0 })),
      });
      const body = new FormData();
      body.append("image", prepared.file);
      body.append("video", videoFile);
      const uploaded = await api.upload("/uploads/live-photos", body, {
        signal: controller.signal,
        onProgress: ({ percent }) => setUploadState((current) => ({ ...current, status: "uploading", stage: "正在上传 Live Photo", percent })),
      });
      await api.post(`/uploads/${uploaded.data.image.id}/bind`, { bound_type: "post", bound_id: currentPost.id });
      await refreshPost(currentPost.id);
      await onInsertMedia?.(uploaded.data.image.id);
      setLiveImage(null);
      setLiveVideo(null);
      if (liveImageInputRef.current) liveImageInputRef.current.value = "";
      if (liveVideoInputRef.current) liveVideoInputRef.current.value = "";
      setMessage("Live Photo 已上传、配对、插入正文并保存。");
      setUploadState(null);
    } catch (uploadError) {
      const cancelled = uploadError.code === "REQUEST_ABORTED" || uploadError.name === "AbortError";
      setError(cancelled ? "上传已取消。" : uploadError.message);
      setUploadState((current) => ({ ...current, status: cancelled ? "cancelled" : "error", stage: cancelled ? "上传已取消" : "上传失败" }));
      setRetryUpload({ kind: "live", image: imageFile, video: videoFile });
    } finally {
      activeUploadRef.current = null;
      busyRef.current = false;
      setBusy("");
    }
  };

  const cancelUpload = () => activeUploadRef.current?.abort();
  const retryLastUpload = () => {
    if (retryUpload?.kind === "image") {
      void runImageUpload(retryUpload.file);
    } else if (retryUpload?.kind === "live") {
      void uploadLivePhoto({ image: retryUpload.image, video: retryUpload.video });
    }
  };

  const insertExisting = async (mediaId) => {
    if (!onInsertMedia || busyRef.current) return;
    onPrepareInsert?.();
    busyRef.current = true;
    setBusy(`insert-${mediaId}`);
    setError("");
    setMessage("");
    try {
      await onInsertMedia(mediaId);
      setMessage("图片已插入正文并保存。");
    } catch (insertError) {
      setError(insertError.message || "图片位置保存失败，请重试。");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  const savePresentation = async (row, data) => {
    if (editingMediaId !== row.primary.id || busyRef.current) return;
    busyRef.current = true;
    setBusy(`alt-${row.primary.id}`);
    setError("");
    setMessage("");
    try {
      await api.patch(`/uploads/manage/media/${row.primary.id}`, {
        ...data,
      });
      await refreshPost(post.id);
      setEditingMediaId(null);
      setMessage("图片说明、图注和版式已保存。");
    } catch (presentationError) {
      setError(presentationError.message || "图片设置保存失败，请重试。");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  const setCover = async (mediaId) => {
    if (!post?.id || busyRef.current) return;
    busyRef.current = true;
    setBusy(`cover-${mediaId || "none"}`);
    setError("");
    setMessage("");
    try {
      await api.patch(`/posts/${post.id}`, { cover_media_id: mediaId });
      await refreshPost(post.id);
      setMessage(mediaId ? "封面已更新。" : "已取消封面，图片仍保留在内容媒体中。");
    } catch (coverError) {
      setError(coverError.message);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  const unbind = async () => {
    if (!removeTarget || !post?.id || busyRef.current) return;
    busyRef.current = true;
    setBusy(`remove-${removeTarget.primary.id}`);
    setError("");
    setMessage("");
    try {
      await api.delete(`/uploads/${removeTarget.primary.id}/bind`);
      onRemoveMedia?.(removeTarget.items.map((item) => item.id));
      await refreshPost(post.id);
      setMessage(removeTarget.kind === "live_photo" ? "Live Photo 已从正文和内容媒体中移除。" : "图片已从正文和内容媒体中移除。");
      setRemoveTarget(null);
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  return (
    <section className="media-manager" aria-labelledby="post-media-heading">
      <div className="media-manager-header">
        <div>
          <h2 id="post-media-heading">图片与 Live Photo</h2>
          <p>上传前会先保存当前草稿。上传后自动插入正文，也可以从列表重新插入已有媒体。</p>
        </div>
        <label
          className={`btn btn-secondary file-picker ${busy ? "is-disabled" : ""}`}
          aria-disabled={Boolean(busy)}
          onMouseDown={() => onPrepareInsert?.()}
        >
          {busy === "image" ? "正在上传图片" : "上传并插入图片"}
          <input ref={imageInputRef} type="file" accept={IMAGE_ACCEPT} disabled={Boolean(busy)} onChange={uploadImage} />
        </label>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}
      <UploadProgress state={uploadState} onCancel={cancelUpload} onRetry={retryUpload ? retryLastUpload : null} />

      {rows.length ? (
        <div className="media-management-list">
          {rows.map((row) => {
            const previewPath = row.primary.manage_thumbnail_path || row.primary.thumbnail_path || row.primary.manage_path || row.primary.read_path;
            const isCover = post?.cover_media_id === row.primary.id;
            const isInline = row.items.some((item) => inlineMediaIds.has(Number(item.id)));
            return (
              <article className="media-management-row" key={row.id}>
                <ProtectedImage path={previewPath} alt={row.primary.alt_text || ""} className="media-management-preview" />
                <div>
                  <h3>{row.kind === "live_photo" ? "Live Photo" : "图片"}</h3>
                  <p>{row.kind === "live_photo" ? "图片与视频配对" : `${row.primary.width || "?"} × ${row.primary.height || "?"}`}</p>
                  {isCover ? <span className="media-cover-state">当前封面</span> : null}
                  {isInline ? <span className="media-inline-state"> · 已在正文</span> : null}
                  {editingMediaId === row.primary.id ? (
                    <MediaPresentationEditor
                      media={row.primary}
                      busy={busy === `alt-${row.primary.id}`}
                      compact
                      onSave={(data) => savePresentation(row, data)}
                      onCancel={() => setEditingMediaId(null)}
                    />
                  ) : (
                    <button
                      className="text-button media-alt-trigger"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => setEditingMediaId(row.primary.id)}
                    >
                      {row.primary.caption || row.primary.alt_text ? "编辑图片说明与版式" : "添加图片说明与版式"}
                    </button>
                  )}
                </div>
                <div className="media-management-actions">
                  {onInsertMedia ? (
                    <button className="btn btn-secondary" type="button" disabled={Boolean(busy) || isInline} onClick={() => { void insertExisting(row.primary.id); }}>
                      {busy === `insert-${row.primary.id}` ? "正在插入" : isInline ? "已插入正文" : "插入正文"}
                    </button>
                  ) : null}
                  {row.kind === "image" && !isCover ? <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => setCover(row.primary.id)}>设为封面</button> : null}
                  {isCover ? <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => setCover(null)}>取消封面</button> : null}
                  <button className="text-button danger-text" type="button" disabled={Boolean(busy)} onClick={() => setRemoveTarget(row)}>移除</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className="media-empty">还没有绑定媒体。可以选择文件，也可以直接拖拽或粘贴图片到正文编辑区。</p>}

      <section
        className="live-photo-uploader"
        aria-labelledby="live-photo-uploader-title"
        aria-busy={busy === "live" || undefined}
      >
        <div className="live-photo-uploader-header">
          <div>
            <h3 id="live-photo-uploader-title">上传 Live Photo</h3>
            <p>同时选择静态图片与配对视频，上传后会作为一组媒体绑定并插入当前正文。</p>
          </div>
        </div>

        <div className="live-photo-fields">
          <div className="live-photo-file-field">
            <div className="live-photo-file-copy">
              <span>静态图片</span>
              <small title={liveImage?.name}>{liveImage?.name || "JPEG、PNG、WebP、HEIC 或 HEIF"}</small>
            </div>
            <label
              className={`btn btn-secondary live-photo-file-picker ${busy ? "is-disabled" : ""}`}
              aria-disabled={Boolean(busy)}
              onMouseDown={() => onPrepareInsert?.()}
            >
              {liveImage ? "更换图片" : "选择图片"}
              <input
                ref={liveImageInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                disabled={Boolean(busy)}
                aria-label="选择 Live Photo 静态图片"
                onChange={(event) => setLiveImage(event.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="live-photo-file-field">
            <div className="live-photo-file-copy">
              <span>动态视频</span>
              <small title={liveVideo?.name}>{liveVideo?.name || "MOV 或 MP4"}</small>
            </div>
            <label
              className={`btn btn-secondary live-photo-file-picker ${busy ? "is-disabled" : ""}`}
              aria-disabled={Boolean(busy)}
              onMouseDown={() => onPrepareInsert?.()}
            >
              {liveVideo ? "更换视频" : "选择视频"}
              <input
                ref={liveVideoInputRef}
                type="file"
                accept="video/quicktime,video/mp4,.mov,.mp4"
                disabled={Boolean(busy)}
                aria-label="选择 Live Photo 动态视频"
                onChange={(event) => setLiveVideo(event.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="live-photo-actions">
          <p>两份文件会作为同一组 Live Photo 上传、绑定并插入正文，媒体仍只通过鉴权接口读取。</p>
          <button
            className="btn btn-primary live-photo-upload-button"
            type="button"
            disabled={!liveImage || !liveVideo || Boolean(busy)}
            onClick={() => { void uploadLivePhoto(); }}
          >
            {busy === "live" ? "正在上传并配对" : "上传、配对并插入"}
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={removeTarget?.kind === "live_photo" ? "移除这组 Live Photo？" : "移除这张图片？"}
        description="媒体会与当前内容解除绑定；正文中的内部媒体占位和封面引用也会同步清理。"
        confirmLabel="确认移除"
        danger
        busy={busy.startsWith("remove-")}
        onConfirm={unbind}
        onClose={() => setRemoveTarget(null)}
      />
    </section>
  );
});
