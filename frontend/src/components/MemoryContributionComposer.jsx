import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { IMAGE_ACCEPT, isAcceptedImageFile, prepareImageForUpload } from "../lib/imageUpload";
import {
  localDateTimeValue, memoryContributionPayload, memoryDraftKey,
  readMemoryDraft, removeMemoryDraft, writeMemoryDraft,
} from "../lib/memoryContributions";
import { ProtectedImage } from "./ProtectedImage";
import { UploadProgress } from "./UploadProgress";

function activeImages(post) {
  return (post?.bound_media || []).filter((item) => (
    item.kind !== "live_photo_video" && item.status === "active" && !item.deleted_at
  ));
}

export function MemoryContributionComposer({ rootPost, collection, defaults, onPublished, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const storageKey = memoryDraftKey(user.id, rootPost.id);
  const restored = useMemo(() => readMemoryDraft(window.localStorage, storageKey), [storageKey]);
  const [form, setForm] = useState({
    body: restored?.body || "",
    occurredAt: restored?.occurredAt || localDateTimeValue(defaults?.occurred_at),
    location: restored?.location || defaults?.location || "",
  });
  const requestIdRef = useRef(restored?.requestId || crypto.randomUUID());
  const postRef = useRef(null);
  const [post, setPost] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [contextUnavailable, setContextUnavailable] = useState(false);
  const [message, setMessage] = useState(restored ? "已恢复这台设备上的补充草稿。" : "");
  const [advanced, setAdvanced] = useState(Boolean(form.occurredAt || form.location));
  const [uploadState, setUploadState] = useState(null);
  const [retryFiles, setRetryFiles] = useState(null);
  const abortRef = useRef(null);
  const bodyRef = useRef(null);

  const replacePost = (value) => {
    postRef.current = value;
    setPost(value);
  };

  useEffect(() => { bodyRef.current?.focus(); }, []);

  useEffect(() => {
    if (!restored?.postId) return undefined;
    let active = true;
    api.get(`/posts/me/${restored.postId}`).then((result) => {
      if (!active || result.data?.status !== "draft") return;
      replacePost(result.data);
      setForm((current) => ({
        ...current,
        body: current.body || result.data.body || "",
        occurredAt: current.occurredAt || localDateTimeValue(result.data.occurred_at),
        location: current.location || result.data.location || "",
      }));
    }).catch(() => {
      if (active) setMessage("服务器草稿已不可用，本地文字仍已保留。");
    });
    return () => { active = false; };
  }, [restored?.postId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeMemoryDraft(window.localStorage, storageKey, {
        requestId: requestIdRef.current,
        postId: post?.id || restored?.postId || null,
        ...form,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, post?.id, restored?.postId, storageKey]);

  const ensureDraft = async () => {
    if (postRef.current) return postRef.current;
    const result = await api.post(`/posts/${rootPost.id}/memory-contributions`, {
      client_request_id: requestIdRef.current,
    });
    replacePost(result.data);
    return result.data;
  };

  const save = async () => {
    const draft = await ensureDraft();
    const result = await api.patch(`/posts/${draft.id}`, memoryContributionPayload(form, draft.edit_version));
    replacePost(result.data);
    return result.data;
  };

  const refresh = async (postId) => {
    const result = await api.get(`/posts/me/${postId}`);
    replacePost(result.data);
    return result.data;
  };

  const publish = async () => {
    if (!form.body.trim() && !activeImages(postRef.current).length) {
      setError("补充至少需要一句话或一张图片。");
      return;
    }
    setBusy("publishing");
    setError("");
    setMessage("");
    try {
      const draft = await save();
      const result = await api.post(`/posts/${draft.id}/publish`, {
        expected_version: draft.edit_version,
      });
      removeMemoryDraft(window.localStorage, storageKey);
      onPublished(result.data);
    } catch (publishError) {
      setContextUnavailable(publishError.code === "MEMORY_CONTEXT_UNAVAILABLE");
      setError(publishError.code === "MEMORY_CONTEXT_UNAVAILABLE"
        ? "原记录或参与范围已不可用。你的文字和图片仍保存在草稿中。"
        : publishError.message);
    } finally {
      setBusy("");
    }
  };

  const keepAsPrivateDraft = async () => {
    const draft = postRef.current;
    if (!draft) return;
    setBusy("detaching");
    setError("");
    try {
      const result = await api.post(`/posts/${draft.id}/memory-link/detach`, {
        expected_version: draft.edit_version,
        destination: "private",
      });
      removeMemoryDraft(window.localStorage, storageKey);
      navigate(`/write/${result.data.id}`);
    } catch (detachError) {
      setError(detachError.message);
      setBusy("");
    }
  };

  const saveAndClose = async () => {
    setBusy("saving");
    setError("");
    try {
      await save();
      setMessage("补充草稿已保存。你可以稍后继续。 ");
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy("");
    }
  };

  const openEditor = async () => {
    setBusy("saving");
    setError("");
    try {
      const draft = await save();
      navigate(`/write/${draft.id}`);
    } catch (saveError) {
      setError(saveError.message);
      setBusy("");
    }
  };

  const uploadFiles = async (files) => {
    if (!files.length) return;
    if (files.some((file) => !isAcceptedImageFile(file))) {
      setError("只支持 JPEG、PNG、WebP、HEIC 或 HEIF 图片。");
      return;
    }
    setBusy("uploading");
    setError("");
    setRetryFiles(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let draft;
    try {
      draft = await save();
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadState({ status: "optimizing", stage: "正在检查图片", percent: 0, currentFile: index + 1, totalFiles: files.length, fileName: file.name });
        const prepared = await prepareImageForUpload(file, {
          signal: controller.signal,
          onStage: (stage) => setUploadState((current) => ({ ...current, stage })),
        });
        const body = new FormData();
        body.append("file", prepared.file);
        const uploaded = await api.upload("/uploads/images", body, {
          signal: controller.signal,
          onProgress: ({ percent }) => setUploadState((current) => ({ ...current, status: "uploading", stage: "正在上传", percent })),
        });
        await api.post(`/uploads/${uploaded.data.id}/bind`, { bound_type: "post", bound_id: draft.id });
      }
      await refresh(draft.id);
      setUploadState(null);
      setMessage(files.length > 1 ? `已加入 ${files.length} 张图片。` : "图片已加入补充。 ");
    } catch (uploadError) {
      const cancelled = controller.signal.aborted || uploadError.code === "REQUEST_ABORTED";
      setUploadState((current) => ({ ...(current || {}), status: cancelled ? "cancelled" : "error" }));
      setRetryFiles(files);
      if (!cancelled) setError(uploadError.message);
    } finally {
      abortRef.current = null;
      setBusy("");
    }
  };

  const removeImage = async (mediaId) => {
    if (busy) return;
    setBusy(`remove-${mediaId}`);
    setError("");
    try {
      await api.delete(`/uploads/${mediaId}/bind`);
      await refresh(postRef.current.id);
      setMessage("图片已从补充中移除。");
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy("");
    }
  };

  const images = activeImages(post);
  const rootAuthor = rootPost.author?.nickname || rootPost.author?.username || "朋友";
  return (
    <div className="memory-composer" aria-busy={Boolean(busy) || undefined}>
      <div className="memory-composer-context">
        <span>正在补充</span>
        <strong>{rootAuthor} 的这段记录</strong>
        <small>发布到《{collection.name}》· 当前合集成员可见</small>
      </div>
      <textarea ref={bodyRef} aria-label="共同回忆补充正文" value={form.body} maxLength={20000}
        placeholder="留下一句话，或者一张你拍的照片……"
        onChange={(event) => { setError(""); setForm((current) => ({ ...current, body: event.target.value })); }} />
      {images.length ? <div className="memory-composer-images">{images.map((image) => (
        <div key={image.id}><ProtectedImage path={image.manage_thumbnail_path || image.thumbnail_path || image.manage_path || image.read_path} alt="补充草稿中的图片" />
          <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => void removeImage(image.id)}>移除图片</button>
        </div>
      ))}</div> : null}
      <UploadProgress state={uploadState} compact
        onCancel={() => abortRef.current?.abort()}
        onRetry={retryFiles ? () => void uploadFiles(retryFiles) : undefined} />
      <button className="text-button memory-advanced-toggle" type="button" onClick={() => setAdvanced((value) => !value)}>
        {advanced ? "收起发生信息" : "补充发生时间与地点"}
      </button>
      {advanced ? <div className="memory-composer-fields">
        <label><span>发生时间</span><input type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((current) => ({ ...current, occurredAt: event.target.value }))} /></label>
        <label><span>地点</span><input maxLength={255} value={form.location} placeholder="可修改" onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></label>
      </div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {contextUnavailable && post ? <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => void keepAsPrivateDraft()}>转为独立私密草稿</button> : null}
      {message ? <div className="inline-success" role="status">{message}</div> : null}
      <div className="memory-composer-actions">
        <label className={`btn btn-secondary file-picker ${busy ? "is-disabled" : ""}`}>
          添加图片<input type="file" multiple accept={IMAGE_ACCEPT} disabled={Boolean(busy)} onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void uploadFiles(files); }} />
        </label>
        <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void saveAndClose()}>保存并关闭</button>
        <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => void openEditor()}>完整编辑</button>
        <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={() => void publish()}>{busy === "publishing" ? "正在发布" : "发布补充"}</button>
      </div>
    </div>
  );
}
