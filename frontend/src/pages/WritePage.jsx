import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CustomSelect } from "../components/CustomSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ProtectedMarkdown } from "../components/ProtectedMarkdown";
import { ErrorState, PageLoader } from "../components/States";
import { PostMediaManager } from "../components/PostMediaManager";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import {
  AUTOSAVE_DELAY,
  autosaveStatusLabel,
  draftFingerprint,
  draftPayloadFromForm,
} from "../lib/draftAutosave";
import {
  insertMediaPlaceholder,
  mediaIdsInMarkdown,
  removeMediaPlaceholders,
} from "../lib/internalMedia";
import { applyMarkdownShortcut, markdownActionForKeyEvent } from "../lib/markdownToolbar";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const acceptedInlineImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const PREVIEW_DELAY = 220;
const MARKDOWN_SHORTCUTS = [
  { action: "heading", label: "标题", hint: "插入二级标题" },
  { action: "bold", label: "加粗", hint: "加粗选中文字（⌘/Ctrl+B）" },
  { action: "quote", label: "引用", hint: "插入引用" },
  { action: "list", label: "无序列表", hint: "插入无序列表（⌘/Ctrl+Shift+8）" },
  { action: "orderedList", label: "有序列表", hint: "插入有序列表（⌘/Ctrl+Shift+7）" },
  { action: "link", label: "链接", hint: "插入链接（⌘/Ctrl+K）" },
  { action: "footnote", label: "脚注", hint: "插入脚注引用与定义" },
  { action: "inlineMath", label: "行内公式", hint: "插入 $...$ 行内公式，也兼容 \\(...\\)" },
  { action: "mathBlock", label: "块公式", hint: "插入 $$...$$ 块公式，也兼容 \\[...\\]" },
  { action: "code", label: "代码", hint: "插入代码块" },
  { action: "table", label: "表格", hint: "插入表格模板" },
];

function toLocalDatetime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function initialForm(type = "article", collectionId = "") {
  return {
    post_type: type,
    title: "",
    summary: "",
    body: "",
    visibility: "private",
    occurred_at: "",
    location: "",
    mood: "",
    external_video_url: "",
    slug: "",
    collection_id: collectionId,
    category_id: "",
    tag_names: "",
  };
}

function formFromPost(post) {
  return {
    post_type: post.post_type,
    title: post.title || "",
    summary: post.summary || "",
    body: post.body || "",
    visibility: post.visibility || "private",
    occurred_at: toLocalDatetime(post.occurred_at),
    location: post.location || "",
    mood: post.mood || "",
    external_video_url: post.external_video_url || "",
    slug: post.slug || post.slug_candidate || "",
    collection_id: post.collection_id ? String(post.collection_id) : "",
    category_id: post.category?.id ? String(post.category.id) : "",
    tag_names: (post.tags || []).map((tag) => tag.name).join(", "),
  };
}

function validExternalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function pastedImages(event) {
  return Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file && acceptedInlineImageTypes.has(file.type));
}

export function WritePage() {
  const { postId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const requestedType = params.get("type") === "note" ? "note" : "article";
  const requestedCollection = params.get("collection") || "";
  const [form, setForm] = useState(() => initialForm(requestedType, requestedCollection));
  const [collections, setCollections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(Boolean(postId));
  const [loadError, setLoadError] = useState(null);
  const [optionsError, setOptionsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savedPost, setSavedPost] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editorMode, setEditorMode] = useState("write");
  const [preview, setPreview] = useState({ html: "", loading: false, error: "" });
  const [draggingImage, setDraggingImage] = useState(false);
  const [autosave, setAutosave] = useState({ status: "idle", message: "", savedAt: null });
  const [autosaveRetryKey, setAutosaveRetryKey] = useState(0);
  const [reloadConflictOpen, setReloadConflictOpen] = useState(false);
  const bodyEditorRef = useRef(null);
  const pendingEditorSelectionRef = useRef(null);
  const mediaManagerRef = useRef(null);
  const initialPayload = draftPayloadFromForm(initialForm(requestedType, requestedCollection));
  const payloadRef = useRef(initialPayload);
  const savedPostRef = useRef(null);
  const lastSavedFingerprintRef = useRef(draftFingerprint(initialPayload));
  const autosaveBlockedRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const editorGenerationRef = useRef(0);
  const routeReadyRef = useRef(!postId);
  usePageMeta(postId ? "编辑记录" : "新建记录");

  useLayoutEffect(() => {
    if (editorMode !== "write") return;
    const selection = pendingEditorSelectionRef.current;
    const editor = bodyEditorRef.current;
    if (!selection || !editor) return;

    pendingEditorSelectionRef.current = null;
    editor.focus();
    editor.setSelectionRange(selection[0], selection[1]);
  }, [editorMode, form.body]);

  useEffect(() => {
    let active = true;
    const generation = editorGenerationRef.current + 1;
    editorGenerationRef.current = generation;
    routeReadyRef.current = false;
    setOptionsError("");

    Promise.allSettled([
      api.get("/collections?page_size=100"),
      api.get("/categories/options"),
    ]).then(([collectionResult, categoryResult]) => {
      if (!active) return;
      if (collectionResult.status === "fulfilled") setCollections(collectionResult.value.data || []);
      if (categoryResult.status === "fulfilled") setCategories(categoryResult.value.data || []);
      if (collectionResult.status === "rejected" || categoryResult.status === "rejected") {
        setOptionsError("部分写作选项读取失败，可以刷新后重试。");
      }
    });

    if (postId) {
      setLoading(true);
      setLoadError(null);
      api.get(`/posts/me/${postId}`)
        .then((result) => {
          if (!active) return;
          const loadedForm = formFromPost(result.data);
          const loadedFingerprint = draftFingerprint(draftPayloadFromForm(loadedForm));
          const preserveSavedState = savedPostRef.current?.id === result.data.id
            && lastSavedFingerprintRef.current === loadedFingerprint;
          savedPostRef.current = result.data;
          lastSavedFingerprintRef.current = loadedFingerprint;
          autosaveBlockedRef.current = false;
          setSavedPost(result.data);
          setForm(loadedForm);
          setAutosave((current) => (
            preserveSavedState && current.status === "saved"
              ? current
              : { status: "idle", message: "", savedAt: null }
          ));
          routeReadyRef.current = true;
          setLoading(false);
        })
        .catch((loadFailure) => {
          if (!active) return;
          setLoadError(loadFailure);
          routeReadyRef.current = true;
          setLoading(false);
        });
    } else {
      const freshForm = initialForm(requestedType, requestedCollection);
      const freshFingerprint = draftFingerprint(draftPayloadFromForm(freshForm));
      savedPostRef.current = null;
      lastSavedFingerprintRef.current = freshFingerprint;
      autosaveBlockedRef.current = false;
      setSavedPost(null);
      setForm(freshForm);
      setAutosave({ status: "idle", message: "", savedAt: null });
      routeReadyRef.current = true;
      setLoading(false);
    }
    return () => { active = false; };
  }, [postId, reloadKey, requestedCollection, requestedType]);

  useEffect(() => {
    if (editorMode !== "preview") return undefined;
    const controller = new AbortController();
    setPreview((current) => ({ ...current, loading: true, error: "" }));
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.post("/posts/preview", { body: form.body || "" }, { signal: controller.signal });
        setPreview({ html: result.data?.rendered_html || "", loading: false, error: "" });
      } catch (previewError) {
        if (previewError?.code !== "REQUEST_ABORTED") {
          setPreview((current) => ({ ...current, loading: false, error: previewError.message }));
        }
      }
    }, PREVIEW_DELAY);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [editorMode, form.body]);

  const isPublished = Boolean(savedPost?.published_at);
  const inCollection = Boolean(form.collection_id);
  const title = form.post_type === "article" ? "Article" : "Note";
  const inlineMediaIds = useMemo(() => mediaIdsInMarkdown(form.body), [form.body]);
  const collectionUnavailable = Boolean(
    form.collection_id && !collections.some((collection) => String(collection.id) === form.collection_id)
  );
  const categoryUnavailable = Boolean(
    form.category_id && !categories.some((category) => String(category.id) === form.category_id)
  );

  const payload = useMemo(() => {
    return draftPayloadFromForm(form);
  }, [form]);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    savedPostRef.current = savedPost;
  }, [savedPost]);

  const saveDraftSnapshot = useCallback((snapshot, { automatic = false } = {}) => {
    const fingerprint = draftFingerprint(snapshot);
    const generation = editorGenerationRef.current;
    const performSave = async () => {
      if (generation !== editorGenerationRef.current || !routeReadyRef.current) {
        return savedPostRef.current;
      }
      const currentPost = savedPostRef.current;
      if (automatic && (autosaveBlockedRef.current || (currentPost && currentPost.status !== "draft"))) {
        return currentPost;
      }

      if (automatic) {
        setAutosave((current) => ({ ...current, status: "saving", message: "" }));
      }

      try {
        const result = currentPost
          ? await api.patch(
            automatic ? `/posts/${currentPost.id}/autosave` : `/posts/${currentPost.id}`,
            { ...snapshot, expected_version: currentPost.edit_version },
          )
          : await api.post("/posts", snapshot);
        const saved = result.data;
        if (generation !== editorGenerationRef.current) return saved;
        savedPostRef.current = saved;
        lastSavedFingerprintRef.current = fingerprint;
        setSavedPost(saved);
        const currentMatches = draftFingerprint(payloadRef.current) === fingerprint;
        setAutosave({
          status: currentMatches ? "saved" : "dirty",
          message: "",
          savedAt: currentMatches ? new Date() : null,
        });
        if (!currentPost) navigate(`/write/${saved.id}`, { replace: true });
        return saved;
      } catch (saveError) {
        if (generation !== editorGenerationRef.current) throw saveError;
        const conflict = saveError.code === "EDIT_CONFLICT";
        if (conflict) autosaveBlockedRef.current = true;
        if (automatic || conflict) {
          const collectionFailure = saveError.code === "COLLECTION_UNAVAILABLE";
          setAutosave({
            status: conflict ? "conflict" : "error",
            message: collectionFailure
              ? "原 Collection 已不可用。正文仍保留在本地，请改选“不加入 Collection”或其他 Collection 后重试。"
              : saveError.message,
            savedAt: null,
          });
        }
        throw saveError;
      }
    };

    const queued = saveQueueRef.current.then(performSave, performSave);
    saveQueueRef.current = queued.catch(() => null);
    return queued;
  }, [navigate]);

  const savedPostStatus = savedPost?.status;

  useEffect(() => {
    if (loading || !routeReadyRef.current || autosaveBlockedRef.current) return undefined;
    if (savedPostStatus && savedPostStatus !== "draft") return undefined;
    const fingerprint = draftFingerprint(payload);
    if (fingerprint === lastSavedFingerprintRef.current) return undefined;

    setAutosave((current) => ({ ...current, status: "dirty", message: "" }));
    const timer = window.setTimeout(() => {
      saveDraftSnapshot(payload, { automatic: true }).catch(() => {});
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [autosaveRetryKey, loading, payload, savedPostStatus, saveDraftSnapshot]);

  const set = (key) => (event) => {
    setError("");
    setMessage("");
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const persistDraft = async (showMessage = true) => {
    setBusy(true);
    setError("");
    if (showMessage) setMessage("");
    try {
      const hadPost = Boolean(savedPostRef.current);
      const result = await saveDraftSnapshot(payloadRef.current);
      if (showMessage) setMessage(hadPost ? "修改已保存。" : "草稿已保存。");
      return result;
    } catch (saveError) {
      if (saveError.code !== "EDIT_CONFLICT") setError(saveError.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const reloadServerDraft = async () => {
    const currentPost = savedPostRef.current;
    if (!currentPost) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.get(`/posts/me/${currentPost.id}`);
      const loadedForm = formFromPost(result.data);
      savedPostRef.current = result.data;
      lastSavedFingerprintRef.current = draftFingerprint(draftPayloadFromForm(loadedForm));
      autosaveBlockedRef.current = false;
      setSavedPost(result.data);
      setForm(loadedForm);
      setAutosave({ status: "idle", message: "", savedAt: null });
      setReloadConflictOpen(false);
      setMessage("已重新载入服务器版本。");
    } catch (reloadError) {
      setError(reloadError.message);
    } finally {
      setBusy(false);
    }
  };

  const validatePublish = () => {
    const tags = payload.tag_names || [];
    if (tags.length > 20) return "Tags 最多填写 20 项。";
    if (form.post_type === "article") {
      if (!form.title.trim()) return "Article 发布前必须填写标题。";
      if (!form.body.trim()) return "Article 发布前必须填写正文。";
      if (!slugPattern.test(form.slug.trim())) return "Article Slug 只能使用小写字母、数字和连字符。";
    } else {
      const hasMedia = Boolean(savedPost?.cover_media_id || savedPost?.bound_media?.length);
      if (!form.body.trim() && !form.external_video_url.trim() && !hasMedia) {
        return "Note 至少需要正文、图片、Live Photo 或外部视频之一。";
      }
      if (!validExternalUrl(form.external_video_url.trim())) return "外部视频链接必须是有效的 HTTP 或 HTTPS 地址。";
    }
    if (collectionUnavailable) return "你已无法访问原 Collection。请先选择“不加入 Collection”并保存，再发布内容。";
    return "";
  };

  const publish = async () => {
    setError("");
    setMessage("");
    const validationError = validatePublish();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      const post = await saveDraftSnapshot(payloadRef.current);
      const published = await api.post(`/posts/${post.id}/publish`, form.post_type === "article" ? { slug: form.slug.trim() } : {});
      navigate(published.data.post_type === "article" ? `/articles/${published.data.slug}` : `/notes/${published.data.id}`, { replace: true });
    } catch (publishError) {
      if (publishError.code !== "EDIT_CONFLICT") setError(publishError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMediaPostChange = (post) => {
    savedPostRef.current = post;
    setSavedPost(post);
    if (!postId) navigate(`/write/${post.id}`, { replace: true });
  };

  const applyMarkdownFormat = (action) => {
    const textarea = bodyEditorRef.current;
    const selectionStart = editorMode === "write" && textarea ? textarea.selectionStart : form.body.length;
    const selectionEnd = editorMode === "write" && textarea ? textarea.selectionEnd : selectionStart;
    setForm((current) => {
      const next = applyMarkdownShortcut(current.body, selectionStart, selectionEnd, action);
      pendingEditorSelectionRef.current = [next.selectionStart, next.selectionEnd];
      return { ...current, body: next.value };
    });
    setEditorMode("write");
    setError("");
    setMessage("");
  };

  const handleBodyKeyDown = (event) => {
    const action = markdownActionForKeyEvent(event);
    if (!action) return;
    event.preventDefault();
    applyMarkdownFormat(action);
  };

  const insertMediaIntoBody = (mediaId) => {
    const textarea = bodyEditorRef.current;
    const selectionStart = editorMode === "write" && textarea ? textarea.selectionStart : null;
    const selectionEnd = editorMode === "write" && textarea ? textarea.selectionEnd : null;
    setForm((current) => {
      const start = selectionStart ?? current.body.length;
      const end = selectionEnd ?? start;
      const next = insertMediaPlaceholder(current.body, mediaId, start, end);
      pendingEditorSelectionRef.current = [next.cursor, next.cursor];
      return { ...current, body: next.value };
    });
    setEditorMode("write");
    setError("");
    setMessage("媒体已插入正文；保存草稿或发布后会永久保留这个位置。");
  };

  const removeMediaFromBody = (mediaIds) => {
    setForm((current) => ({
      ...current,
      body: removeMediaPlaceholders(current.body, mediaIds),
    }));
  };

  const uploadInlineImages = async (files) => {
    for (const file of files) {
      const manager = mediaManagerRef.current;
      if (!manager?.uploadImageFile) return;
      await manager.uploadImageFile(file, { insertIntoBody: true });
    }
  };

  const handleBodyDrop = async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    event.preventDefault();
    setDraggingImage(false);
    const images = files.filter((file) => acceptedInlineImageTypes.has(file.type));
    if (!images.length) {
      setError("正文拖拽只支持 JPEG、PNG 或 WebP 图片；Live Photo 请使用下方配对上传。");
      return;
    }
    await uploadInlineImages(images);
  };

  const handleBodyPaste = async (event) => {
    const images = pastedImages(event);
    if (!images.length) return;
    event.preventDefault();
    await uploadInlineImages(images);
  };

  if (loading) return <PageLoader label="正在读取草稿" />;
  if (loadError) return <main className="page-shell narrow-page"><ErrorState error={loadError} onRetry={() => setReloadKey((value) => value + 1)} /></main>;

  return (
    <main className="page-shell editor-page">
      <header className="page-heading editor-heading">
        <div>
          <h1>{postId ? `编辑 ${title}` : `新建 ${title}`}</h1>
          <p>草稿默认仅自己可见。加入 Collection 后，阅读与投稿范围自动跟随该 Collection。</p>
        </div>
        <div className="editor-top-actions">
          <Link className="btn btn-secondary" to="/me/posts">返回我的内容</Link>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => persistDraft(true)}>
            {busy ? "正在保存" : savedPost ? "保存修改" : "保存草稿"}
          </button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={publish}>
            {busy ? "正在处理" : savedPost?.status === "archived" ? "重新发布" : savedPost?.status === "published" ? "保存并发布" : "发布"}
          </button>
        </div>
      </header>

      {error ? <div className="inline-error editor-feedback" role="alert">{error}</div> : null}
      {message ? <div className="inline-success editor-feedback" role="status">{message}</div> : null}
      {autosave.status === "error" || autosave.status === "conflict" ? (
        <div className="inline-error editor-feedback autosave-feedback" role="alert">
          <span>{autosave.message || autosaveStatusLabel(autosave)}</span>
          {autosave.status === "conflict" ? (
            <button className="btn btn-secondary" type="button" onClick={() => setReloadConflictOpen(true)}>
              重新载入服务器版本
            </button>
          ) : (
            <button className="btn btn-secondary" type="button" onClick={() => setAutosaveRetryKey((value) => value + 1)}>
              重试自动保存
            </button>
          )}
        </div>
      ) : null}

      <form className="editor-layout" onSubmit={(event) => event.preventDefault()}>
        <div className="editor-main">
          <fieldset className="segmented-field" disabled={isPublished}>
            <legend>内容类型</legend>
            <label className={form.post_type === "article" ? "selected" : ""}>
              <input type="radio" name="post_type" value="article" checked={form.post_type === "article"}
                onChange={() => setForm((current) => ({ ...current, post_type: "article", occurred_at: "", location: "", mood: "", external_video_url: "" }))} />
              <span>Article</span>
            </label>
            <label className={form.post_type === "note" ? "selected" : ""}>
              <input type="radio" name="post_type" value="note" checked={form.post_type === "note"}
                onChange={() => setForm((current) => ({ ...current, post_type: "note", category_id: "", summary: "", slug: "" }))} />
              <span>Note</span>
            </label>
            {isPublished ? <small>第一次发布后类型由后端锁定。</small> : null}
          </fieldset>

          <label>
            <span>标题 {form.post_type === "article" ? "（发布时必填）" : "（可选）"}</span>
            <input maxLength={240} value={form.title} onChange={set("title")} />
          </label>

          {form.post_type === "article" ? (
            <>
              <label>
                <span>摘要</span>
                <textarea className="short-textarea" maxLength={500} value={form.summary} onChange={set("summary")} />
              </label>
              <div className="form-grid editor-field-grid">
                <label>
                  <span>Slug</span>
                  <input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} aria-invalid={Boolean(form.slug) && !slugPattern.test(form.slug.trim())} />
                  <small>发布时必填；历史 Slug 由后端保留。</small>
                </label>
                <label>
                  <span>Category</span>
                  <CustomSelect value={form.category_id} onChange={set("category_id")}>
                    <option value="">不设置 Category</option>
                    {categoryUnavailable ? <option value={form.category_id}>{savedPost?.category?.name || "当前 Category"}（已停用）</option> : null}
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </CustomSelect>
                </label>
              </div>
            </>
          ) : (
            <div className="form-grid editor-field-grid">
              <label>
                <span>发生时间</span>
                <input type="datetime-local" value={form.occurred_at} onChange={set("occurred_at")} />
              </label>
              <label>
                <span>地点</span>
                <input maxLength={255} value={form.location} onChange={set("location")} />
              </label>
              <label>
                <span>心情</span>
                <input maxLength={100} value={form.mood} onChange={set("mood")} />
              </label>
              <label>
                <span>外部视频链接</span>
                <input type="url" value={form.external_video_url} onChange={set("external_video_url")} aria-invalid={!validExternalUrl(form.external_video_url)} />
              </label>
            </div>
          )}

          <section className="editor-body-section" aria-labelledby="editor-body-heading">
            <div className="editor-body-toolbar">
              <div>
                <span id="editor-body-heading">正文</span>
                <small>支持 Markdown；不熟悉语法时可直接使用快捷按钮，图片也可以拖入或粘贴。</small>
              </div>
              <div className="editor-mode-tabs" role="tablist" aria-label="正文编辑模式">
                <button type="button" role="tab" aria-selected={editorMode === "write"} className={editorMode === "write" ? "active" : ""} onClick={() => setEditorMode("write")}>编辑</button>
                <button type="button" role="tab" aria-selected={editorMode === "preview"} className={editorMode === "preview" ? "active" : ""} onClick={() => setEditorMode("preview")}>安全预览</button>
              </div>
            </div>

            {editorMode === "write" ? (
              <div className="markdown-shortcut-toolbar" role="toolbar" aria-label="Markdown 快捷操作">
                {MARKDOWN_SHORTCUTS.map((item) => (
                  <button
                    key={item.action}
                    className="markdown-shortcut-button"
                    type="button"
                    title={item.hint}
                    aria-label={`${item.label}：${item.hint}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyMarkdownFormat(item.action)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}

            {editorMode === "write" ? (
              <div
                className={`body-editor-dropzone ${draggingImage ? "is-dragging" : ""}`}
                onDragEnter={(event) => {
                  if (event.dataTransfer?.types?.includes("Files")) setDraggingImage(true);
                }}
                onDragOver={(event) => {
                  if (!event.dataTransfer?.types?.includes("Files")) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setDraggingImage(true);
                }}
                onDragLeave={() => setDraggingImage(false)}
                onDrop={handleBodyDrop}
              >
                <textarea
                  ref={bodyEditorRef}
                  className="body-editor"
                  value={form.body}
                  onChange={set("body")}
                  onKeyDown={handleBodyKeyDown}
                  onPaste={handleBodyPaste}
                  placeholder="支持 Markdown。把图片拖到这里，或直接粘贴截图。"
                  aria-describedby="editor-body-help"
                />
                <div className="body-drop-hint" aria-hidden={!draggingImage}>
                  松开即可上传并插入图片
                </div>
              </div>
            ) : (
              <div className="editor-preview" role="tabpanel" aria-live="polite">
                {preview.loading ? <p className="editor-preview-state">正在生成安全预览…</p> : null}
                {preview.error ? <div className="inline-error" role="alert">{preview.error}</div> : null}
                {!preview.loading && !preview.error && preview.html ? (
                  <ProtectedMarkdown
                    html={preview.html}
                    media={savedPost?.bound_media || []}
                    management
                    className="prose editor-preview-prose"
                  />
                ) : null}
                {!preview.loading && !preview.error && !preview.html ? (
                  <p className="editor-preview-state">正文为空，暂无可预览内容。</p>
                ) : null}
              </div>
            )}
            <small id="editor-body-help" className="editor-body-help">内部媒体使用稳定占位符保存，不会把 Blob URL、签名 URL 或公开 S3 地址写进正文。</small>
          </section>

          <PostMediaManager
            ref={mediaManagerRef}
            post={savedPost}
            ensurePost={() => persistDraft(false)}
            onPostChange={handleMediaPostChange}
            onInsertMedia={insertMediaIntoBody}
            onRemoveMedia={removeMediaFromBody}
            inlineMediaIds={inlineMediaIds}
          />
        </div>

        <aside className="editor-sidebar">
          {optionsError ? <div className="inline-error" role="alert">{optionsError}</div> : null}
          <label>
            <span>Collection</span>
            <CustomSelect value={form.collection_id} onChange={set("collection_id")}>
              <option value="">不加入 Collection</option>
              {collectionUnavailable ? <option value={form.collection_id}>原 Collection（当前不可访问）</option> : null}
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </CustomSelect>
            {collectionUnavailable
              ? <small className="field-error">你已不在原 Collection 中。仍可编辑，但发布前必须先移出。</small>
              : <small>只能选择你当前有权进入和投稿的 Collection。</small>}
          </label>

          <label>
            <span>独立内容可见性</span>
            <CustomSelect disabled={inCollection} value={inCollection ? "private" : form.visibility} onChange={set("visibility")}>
              <option value="private">仅自己</option>
              <option value="login_only">所有登录成员</option>
            </CustomSelect>
            {inCollection ? <small>Collection Post 的 visibility 不扩大合集 ACL。</small> : null}
          </label>

          <label>
            <span>Tags</span>
            <input value={form.tag_names} onChange={set("tag_names")} placeholder="学习, Python, 随想" />
            <small>使用英文逗号分隔，最多 20 个。</small>
          </label>

          <div className="editor-status">
            <span>状态</span>
            <strong>{savedPost?.status || "未保存草稿"}</strong>
          </div>
          <div className={`editor-status editor-save-status is-${autosave.status}`} aria-live="polite">
            <span>草稿保存</span>
            <strong>{autosaveStatusLabel(autosave, !savedPost || savedPost.status === "draft")}</strong>
          </div>
          {savedPost?.cover_media_id ? <div className="editor-status"><span>封面</span><strong>已设置</strong></div> : null}
        </aside>
      </form>

      <ConfirmDialog
        open={reloadConflictOpen}
        title="重新载入服务器版本？"
        description="这会用服务器中的最新版本替换当前编辑器内容；尚未保存的本地修改将丢失。"
        confirmLabel="重新载入"
        danger
        busy={busy}
        onConfirm={reloadServerDraft}
        onClose={() => setReloadConflictOpen(false)}
      />
    </main>
  );
}
