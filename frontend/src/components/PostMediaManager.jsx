import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProtectedImage } from "./ProtectedImage";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function manageableRows(media) {
  const rows = [];
  const handledPairs = new Set();
  for (const item of media || []) {
    if (item.live_photo_pair_id) {
      if (handledPairs.has(item.live_photo_pair_id)) continue;
      handledPairs.add(item.live_photo_pair_id);
      const pair = media.filter((candidate) => candidate.live_photo_pair_id === item.live_photo_pair_id);
      rows.push({
        id: item.live_photo_pair_id,
        kind: "live_photo",
        primary: pair.find((candidate) => candidate.kind === "live_photo_image") || item,
        items: pair,
      });
    } else if (item.kind !== "live_photo_video") {
      rows.push({ id: item.id, kind: "image", primary: item, items: [item] });
    }
  }
  return rows;
}

export const PostMediaManager = forwardRef(function PostMediaManager({
  post,
  ensurePost,
  onPostChange,
  onInsertMedia,
  onRemoveMedia,
  inlineMediaIds = new Set(),
}, ref) {
  const imageInputRef = useRef(null);
  const liveImageInputRef = useRef(null);
  const liveVideoInputRef = useRef(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [liveImage, setLiveImage] = useState(null);
  const [liveVideo, setLiveVideo] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const rows = useMemo(() => manageableRows(post?.bound_media || []), [post?.bound_media]);

  const refreshPost = async (postId) => {
    const result = await api.get(`/posts/me/${postId}`);
    onPostChange(result.data);
    return result.data;
  };

  const uploadImageFile = async (file, { insertIntoBody = true, rethrow = false, postOverride = null } = {}) => {
    if (!file || busyRef.current) return null;
    setError("");
    setMessage("");
    if (!imageTypes.has(file.type)) {
      setError("请选择 JPEG、PNG 或 WebP 图片。");
      return null;
    }

    busyRef.current = true;
    setBusy("image");
    try {
      const currentPost = postOverride || await ensurePost();
      if (!currentPost) return null;
      const body = new FormData();
      body.append("file", file);
      const uploaded = await api.post("/uploads/images", body);
      await api.post(`/uploads/${uploaded.data.id}/bind`, { bound_type: "post", bound_id: currentPost.id });
      await refreshPost(currentPost.id);
      if (insertIntoBody) onInsertMedia?.(uploaded.data.id);
      setMessage(insertIntoBody
        ? "图片已上传、绑定并插入正文。"
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

  const uploadImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file, { insertIntoBody: true });
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const uploadLivePhoto = async () => {
    setError("");
    setMessage("");
    if (!liveImage || !liveVideo) {
      setError("请同时选择 Live Photo 的图片和视频文件。");
      return;
    }
    if (!imageTypes.has(liveImage.type)) {
      setError("Live Photo 图片必须是 JPEG、PNG 或 WebP。");
      return;
    }
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy("live");
    try {
      const currentPost = await ensurePost();
      if (!currentPost) return;
      const body = new FormData();
      body.append("image", liveImage);
      body.append("video", liveVideo);
      const uploaded = await api.post("/uploads/live-photos", body);
      await api.post(`/uploads/${uploaded.data.image.id}/bind`, { bound_type: "post", bound_id: currentPost.id });
      await refreshPost(currentPost.id);
      onInsertMedia?.(uploaded.data.image.id);
      setLiveImage(null);
      setLiveVideo(null);
      if (liveImageInputRef.current) liveImageInputRef.current.value = "";
      if (liveVideoInputRef.current) liveVideoInputRef.current.value = "";
      setMessage("Live Photo 已上传、配对并插入正文。");
    } catch (uploadError) {
      setError(uploadError.message);
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
        <label className={`btn btn-secondary file-picker ${busy ? "is-disabled" : ""}`} aria-disabled={Boolean(busy)}>
          {busy === "image" ? "正在上传图片" : "上传并插入图片"}
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={uploadImage} />
        </label>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}

      {rows.length ? (
        <div className="media-management-list">
          {rows.map((row) => {
            const previewPath = row.primary.manage_thumbnail_path || row.primary.thumbnail_path || row.primary.manage_path || row.primary.read_path;
            const isCover = post?.cover_media_id === row.primary.id;
            const isInline = row.items.some((item) => inlineMediaIds.has(Number(item.id)));
            return (
              <article className="media-management-row" key={row.id}>
                <ProtectedImage path={previewPath} alt="已绑定媒体预览" className="media-management-preview" />
                <div>
                  <h3>{row.kind === "live_photo" ? "Live Photo" : "图片"}</h3>
                  <p>{row.kind === "live_photo" ? "图片与视频配对" : `${row.primary.width || "?"} × ${row.primary.height || "?"}`}</p>
                  {isCover ? <span className="media-cover-state">当前封面</span> : null}
                  {isInline ? <span className="media-inline-state"> · 已在正文</span> : null}
                </div>
                <div className="media-management-actions">
                  {onInsertMedia ? (
                    <button className="btn btn-secondary" type="button" disabled={Boolean(busy) || isInline} onClick={() => onInsertMedia(row.primary.id)}>
                      {isInline ? "已插入正文" : "插入正文"}
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
              <small title={liveImage?.name}>{liveImage?.name || "JPEG、PNG 或 WebP"}</small>
            </div>
            <label
              className={`btn btn-secondary live-photo-file-picker ${busy ? "is-disabled" : ""}`}
              aria-disabled={Boolean(busy)}
            >
              {liveImage ? "更换图片" : "选择图片"}
              <input
                ref={liveImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
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
            onClick={uploadLivePhoto}
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
