import { usePaperDisclosure } from "../hooks/usePaperDisclosure";
import { invalidateHomeFeedCache } from "../lib/homeFeed";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { IMAGE_ACCEPT, IMAGE_FORMAT_LABEL, isAcceptedImageFile, prepareImageForUpload } from "../lib/imageUpload";
import {
  formWithQuickNoteAudience,
  initialQuickNoteForm,
  quickNoteAudienceValue,
  quickNoteBrowseItem,
  quickNoteDraftKey,
  quickNoteHasLocalContent,
  quickNotePayload,
  readQuickNoteDraft,
  removeQuickNoteDraft,
  writeQuickNoteDraft,
} from "../lib/quickNote";
import { CustomSelect } from "./CustomSelect";
import { ProtectedImage } from "./ProtectedImage";
import { UploadProgress } from "./UploadProgress";

function formFromDraft(post, fallback) {
  const occurredAt = post.occurred_at ? new Date(post.occurred_at) : null;
  const localOccurredAt = occurredAt && !Number.isNaN(occurredAt.getTime())
    ? new Date(occurredAt.getTime() - occurredAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : fallback.occurred_at;
  return {
    ...fallback,
    body: post.body || fallback.body,
    visibility: post.visibility || fallback.visibility,
    collection_id: post.collection_id ? String(post.collection_id) : fallback.collection_id,
    occurred_at: localOccurredAt,
    location: post.location || fallback.location,
    mood: post.mood || fallback.mood,
  };
}

function manageableImages(post) {
  return (post?.bound_media || []).filter((item) => (
    item.kind !== "live_photo_video" && item.status === "active" && !item.deleted_at
  ));
}

function QuickNoteMark() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
    <path fill="currentColor" fillRule="evenodd" d="M7.8 6.6 23.6 5.4c.8-.1 1.3.2 1.9.8l5.2 5.5c.5.5.7 1.1.6 1.8l-1.4 19.2c-.1 1.2-.7 1.8-1.9 1.9L6.9 36c-1.2.1-1.9-.6-1.8-1.8l.8-25.6c0-1.1.6-1.8 1.9-2Zm.4 2.1-.9 25.1 20.3-1.3 1.3-18.7-5.6-6.1L8.2 8.7Z" />
    <path fill="currentColor" d="m22.5 6.8-.2 7.2 7.6-.5-1.1-1.7-4.6.2.1-4.1-1.8-1.1ZM11 14.2c1.9-.5 4.3-.6 6.4-.6.8 0 1.1.5.5 1.1-1.8.6-4.6.9-6.6.9-.9 0-1.2-.9-.3-1.4Zm-.5 5.2 5.5-.6c.9-.1 1.2.5.5 1.1-1.6.6-4.1.8-5.8.8-.8 0-1.1-1.1-.2-1.3Z" />
    <path fill="var(--page)" d="m31.2 4.1 6.7 4.5-13.2 19-8.9 5.8 2.4-10.2 13-19.1Z" />
    <path fill="currentColor" d="M32.5 4.8c.7-.9 1.5-1 2.3-.4l1.2.8c.9.6 1.2 1.4.5 2.4l-11.8 17-4.3-3 12.1-16.8Z" />
    <path fill="var(--brand-link)" d="m29.3 9.1 4.5 3.1-1.7 2.3-4.4-3.1 1.6-2.3Z" />
    <path fill="currentColor" d="m20.7 21.2 4.4 3.1-1.3 5.1-6.6 3 1.1-7.1 2.4-4.1Z" />
    <circle cx="21.8" cy="26" r=".9" fill="var(--page)" />
    <path d="m21.2 26.8-2.9 3.7" stroke="var(--page)" strokeWidth="1" strokeLinecap="round" />
    <path fill="var(--brand-link)" d="M8.3 29.6c2.5-.9 4.9-1.3 7.9-.5.6.2.6.8-.1 1-2.5-.2-4.7-.1-7.1.5-.9.2-1.4-.6-.7-1Z" />
  </svg>;
}

export function QuickNoteComposer({ onPublished, autoFocus = false, appearance = "default", onCollectionsLoaded }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const storageKey = quickNoteDraftKey(user?.id);
  const restoredRef = useRef(
    typeof window === "undefined" ? null : readQuickNoteDraft(window.localStorage, storageKey)
  );
  const [form, setForm] = useState(restoredRef.current?.form || initialQuickNoteForm());
  const [post, setPost] = useState(null);
  const postRef = useRef(null);
  const [expanded, setExpanded] = useState(Boolean(restoredRef.current));
  const [promptOpen, setPromptOpen] = useState(appearance !== "homePrompt" || Boolean(restoredRef.current) || autoFocus);
  const [paperRef, rememberPaper] = usePaperDisclosure(`${promptOpen}:${expanded}`);
  const promptButtonRef = useRef(null);
  const closePrompt = () => {
    rememberPaper();
    setPromptOpen(false);
    window.requestAnimationFrame(() => promptButtonRef.current?.focus({ preventScroll: true }));
  };
  const [collections, setCollections] = useState([]);
  const [optionsError, setOptionsError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    restoredRef.current ? "已恢复这台设备上尚未发布的快速随记。" : ""
  );
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const fileInputRef = useRef(null);
  const bodyInputRef = useRef(null);
  const mountedRef = useRef(true);
  const uploadAbortRef = useRef(null);
  const [uploadState, setUploadState] = useState(null);
  const [retryFiles, setRetryFiles] = useState(null);

  const replacePost = (next) => {
    postRef.current = next;
    if (mountedRef.current) setPost(next);
  };

  useEffect(() => {
    mountedRef.current = true;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (autoFocus) bodyInputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    let active = true;
    api.get("/collections?page_size=100").then((result) => {
      if (active) {
        setCollections(result.data || []);
        onCollectionsLoaded?.(result.data || []);
      }
    }).catch((loadError) => {
      if (active) setOptionsError(loadError.message);
    });

    const restoredPostId = restoredRef.current?.post_id;
    if (restoredPostId) {
      api.get(`/posts/me/${restoredPostId}`).then((result) => {
        if (!active) return;
        if (result.data?.status !== "draft" || result.data?.post_type !== "note") {
          replacePost(null);
          return;
        }
        replacePost(result.data);
        setForm((current) => formFromDraft(result.data, current));
      }).catch(() => {
        if (!active) return;
        replacePost(null);
        setMessage("服务器草稿已不可用，本地文字仍已保留。重新发布时会创建新草稿。");
      });
    }
    return () => { active = false; };
  }, [storageKey, onCollectionsLoaded]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (quickNoteHasLocalContent(form, post?.id)) {
        writeQuickNoteDraft(window.localStorage, storageKey, form, post?.id);
      } else {
        removeQuickNoteDraft(window.localStorage, storageKey);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, post?.id, storageKey]);

  const set = (key) => (event) => {
    setError("");
    setMessage("");
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const persistDraft = async () => {
    const payload = quickNotePayload(form);
    const current = postRef.current;
    const result = current
      ? await api.patch(`/posts/${current.id}`, { ...payload, expected_version: current.edit_version })
      : await api.post("/posts", payload);
    replacePost(result.data);
    writeQuickNoteDraft(window.localStorage, storageKey, form, result.data.id);
    return result.data;
  };

  const refreshPost = async (postId) => {
    const result = await api.get(`/posts/me/${postId}`);
    replacePost(result.data);
    writeQuickNoteDraft(window.localStorage, storageKey, form, result.data.id);
    return result.data;
  };

  const publish = async () => {
    setError("");
    setMessage("");
    const hasMedia = manageableImages(post).length > 0;
    if (!form.body.trim() && !hasMedia) {
      setError("随记至少需要文字或一张图片。");
      return;
    }
    if (!online) {
      setError("当前处于离线状态；内容已保存在这台设备，联网后可以继续发布。");
      return;
    }
    setBusy("publishing");
    try {
      const draft = await persistDraft();
      const result = await api.post(`/posts/${draft.id}/publish`, {});
      invalidateHomeFeedCache(user.id, window.sessionStorage);
      const published = quickNoteBrowseItem(result.data);
      removeQuickNoteDraft(window.localStorage, storageKey);
      replacePost(null);
      setForm(initialQuickNoteForm());
      rememberPaper();
      setExpanded(false);
      setPromptOpen(false);
      if (appearance === "homePrompt") window.requestAnimationFrame(() => promptButtonRef.current?.focus({ preventScroll: true }));
      setMessage("随记已发布，并已加入下方的最新记录。");
      onPublished?.(published);
    } catch (publishError) {
      setError(publishError.code === "EDIT_CONFLICT"
        ? "草稿已在其他窗口发生变化。你的本地内容仍保留，请进入完整编辑器处理冲突。"
        : publishError.message);
    } finally {
      if (mountedRef.current) setBusy("");
    }
  };

  const runUploadImages = async (files) => {
    if (!files.length) return;
    const invalid = files.find((file) => !isAcceptedImageFile(file));
    if (invalid) {
      setError(`快速随记支持 ${IMAGE_FORMAT_LABEL} 图片。`);
      return;
    }
    if (!online) {
      setError("图片需要联网上传；文字内容仍会保存在这台设备。 ");
      return;
    }
    setBusy("uploading");
    setError("");
    setMessage("");
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setRetryFiles(null);
    setUploadState({ status: "optimizing", stage: "正在检查图片", percent: 0, currentFile: 1, totalFiles: files.length, fileName: files[0].name });
    let draft = null;
    let completedCount = 0;
    try {
      draft = await persistDraft();
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadState({ status: "optimizing", stage: "正在检查图片", percent: 0, currentFile: index + 1, totalFiles: files.length, fileName: file.name });
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
        await api.post(`/uploads/${uploaded.data.id}/bind`, { bound_type: "post", bound_id: draft.id });
        completedCount = index + 1;
      }
      await refreshPost(draft.id);
      setUploadState(null);
      setMessage(files.length > 1 ? `已上传 ${files.length} 张图片。` : "图片已上传并加入随记。");
    } catch (uploadError) {
      if (draft?.id) await refreshPost(draft.id).catch(() => undefined);
      const cancelled = uploadError.code === "REQUEST_ABORTED" || uploadError.name === "AbortError";
      setError(cancelled ? "图片上传已取消，可以重试。" : `图片上传未全部完成：${uploadError.message}`);
      setUploadState((current) => ({ ...current, status: cancelled ? "cancelled" : "error", stage: cancelled ? "上传已取消" : "上传失败" }));
      const remainingFiles = files.slice(completedCount);
      setRetryFiles(remainingFiles.length ? remainingFiles : null);
    } finally {
      uploadAbortRef.current = null;
      if (mountedRef.current) setBusy("");
    }
  };

  const uploadImages = (event) => {
    const files = Array.from(event.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void runUploadImages(files);
  };

  const removeImage = async (mediaId) => {
    if (busy) return;
    setBusy(`remove-${mediaId}`);
    setError("");
    setMessage("");
    try {
      await api.delete(`/uploads/${mediaId}/bind`);
      if (postRef.current?.id) await refreshPost(postRef.current.id);
      setMessage("图片已从这则随记移除。");
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      if (mountedRef.current) setBusy("");
    }
  };

  const continueInEditor = async () => {
    if (!online) {
      setError("完整编辑器需要先把快速随记保存到服务器；请联网后重试。");
      return;
    }
    setBusy("saving");
    setError("");
    try {
      const draft = await persistDraft();
      removeQuickNoteDraft(window.localStorage, storageKey);
      navigate(`/write/${draft.id}`);
    } catch (saveError) {
      setError(saveError.message);
      setBusy("");
    }
  };

  const images = manageableImages(post);
  const selectedCollectionUnavailable = Boolean(
    form.collection_id && !collections.some((item) => String(item.id) === form.collection_id)
  );

  if (appearance === "homePrompt" && !promptOpen) {
    const hasDraft = quickNoteHasLocalContent(form, post?.id);
    return <section ref={paperRef} className="quick-note-composer is-paper is-home-prompt" aria-labelledby="quick-note-title">
      <button ref={promptButtonRef} type="button" className="home-prompt-activate" aria-expanded="false" aria-controls="quick-note-writing" onClick={() => {
        rememberPaper();
        setPromptOpen(true);
        window.requestAnimationFrame(() => bodyInputRef.current?.focus());
      }}>
        <span className="home-prompt-symbol" aria-hidden="true"><QuickNoteMark /></span>
        <span className="home-prompt-label"><strong id="quick-note-title">写随记</strong><small></small></span>
        <span className="home-prompt-placeholder">{hasDraft ? "草稿已暂存，接着写……" : "今天想记住什么？"}</span>
        <span className="home-prompt-action">{hasDraft ? "继续写" : "开始写"} ↗</span>
      </button>
      {message ? <p className="home-prompt-status" role="status">{message}</p> : null}
      {!online ? <p className="home-prompt-status">离线中：文字仍会保存在这台设备。</p> : null}
      {optionsError ? <p className="home-prompt-status" role="alert">合集读取失败：{optionsError}</p> : null}
    </section>;
  }

  return (
    <section ref={paperRef} id="quick-note-writing" className={`quick-note-composer ${expanded ? "is-expanded" : ""} ${appearance === "paper" || appearance === "homePrompt" ? "is-paper" : ""} ${appearance === "homePrompt" ? "is-home-prompt is-prompt-open" : ""}`} aria-labelledby="quick-note-title" aria-busy={Boolean(busy) || undefined}>
      <div className="quick-note-heading">
        <div>
          <p className="hero-kicker"></p>
          <h2 id="quick-note-title">{appearance === "paper" || appearance === "homePrompt" ? "写随记" : ""}</h2>
        </div>
        <div className="quick-note-heading-actions">
          <button className="text-button" type="button" disabled={Boolean(busy)} aria-expanded={expanded} aria-controls="quick-note-details" onClick={() => { rememberPaper(); setExpanded((current) => !current); }}>
            {expanded ? "收起补充项" : "时间、地点与心情"}
          </button>
          {appearance === "homePrompt" ? <button className="text-button" type="button" disabled={Boolean(busy)} onClick={closePrompt}>收起</button> : null}
        </div>
      </div>

      <textarea
        ref={bodyInputRef}
        className="quick-note-body"
        value={form.body}
        maxLength={20000}
        placeholder={appearance === "paper" || appearance === "homePrompt" ? "写点什么，或留下一张照片……" : "写下此刻的想法、见闻或生活片段……"}
        aria-label="快速随记正文"
        onFocus={() => { if (!expanded) { rememberPaper(); setExpanded(true); } }}
        onChange={set("body")}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void publish();
          }
        }}
      />

      {images.length ? (
        <div className="quick-note-images" aria-label="已上传图片">
          {images.map((image) => (
            <figure key={image.id}>
              <ProtectedImage path={image.manage_thumbnail_path || image.thumbnail_path || image.manage_path || image.read_path} alt="快速随记图片预览" />
              <button type="button" disabled={Boolean(busy)} onClick={() => void removeImage(image.id)} aria-label="移除这张图片">
                {busy === `remove-${image.id}` ? "…" : "×"}
              </button>
            </figure>
          ))}
        </div>
      ) : null}

      {expanded ? (
        <div id="quick-note-details" className="quick-note-fields">
          <label>
            <span>发生时间</span>
            <input type="datetime-local" value={form.occurred_at} disabled={Boolean(busy)} onChange={set("occurred_at")} />
          </label>
          <label>
            <span>地点</span>
            <input maxLength={255} value={form.location} disabled={Boolean(busy)} placeholder="可选" onChange={set("location")} />
          </label>
          <label>
            <span>心情</span>
            <input maxLength={100} value={form.mood} disabled={Boolean(busy)} placeholder="可选" onChange={set("mood")} />
          </label>
        </div>
      ) : null}

      <div className="quick-note-actions">
        <div className="quick-note-tools">
          <label className={`btn btn-secondary file-picker ${busy ? "is-disabled" : ""}`} aria-disabled={Boolean(busy)}>
            {busy === "uploading" ? "正在上传" : "添加图片"}
            <input ref={fileInputRef} type="file" multiple accept={IMAGE_ACCEPT} disabled={Boolean(busy)} onChange={uploadImages} />
          </label>
          <div className="quick-note-audience">
            <span>发布到</span>
            <CustomSelect
              aria-label="快速随记可见范围"
              disabled={Boolean(busy)}
              value={quickNoteAudienceValue(form)}
              onChange={(event) => {
                setError("");
                setForm((current) => formWithQuickNoteAudience(current, event.target.value));
              }}
            >
              <option value="private">仅自己</option>
              <option value="login_only">所有映墨成员</option>
              {selectedCollectionUnavailable ? <option value={`collection:${form.collection_id}`}>原合集（当前不可访问）</option> : null}
              {collections.map((collection) => <option key={collection.id} value={`collection:${collection.id}`}>合集 · {collection.name}</option>)}
            </CustomSelect>
          </div>
        </div>
        <div className="quick-note-submit">
          <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => void continueInEditor()}>
            {busy === "saving" ? "正在保存" : "完整编辑"}
          </button>
          <button className="btn btn-primary" type="button" disabled={Boolean(busy) || selectedCollectionUnavailable} onClick={() => void publish()}>
            {busy === "publishing" ? "正在发布" : "发布随记"}
          </button>
        </div>
      </div>

      <div className="quick-note-status" aria-live="polite">
        <UploadProgress state={uploadState} onCancel={() => uploadAbortRef.current?.abort()} onRetry={retryFiles ? () => { void runUploadImages(retryFiles); } : null} compact />
        {!online ? <p className="quick-note-offline">离线中：文字会保存在这台设备，图片与发布暂不可用。</p> : null}
        {optionsError ? <p className="field-error">合集读取失败：{optionsError}</p> : null}
        {selectedCollectionUnavailable ? <p className="field-error">你已无法访问原合集，请重新选择发布范围。</p> : null}
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        {message ? <div className="inline-success" role="status">{message}</div> : null}
      </div>
      <p className="quick-note-hint">⌘/Ctrl + Enter 发布。标题、标签、Live Photo 与外部视频可在完整编辑器中补充。</p>
    </section>
  );
}
