import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CustomSelect } from "../components/CustomSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MarkdownEditorDialog } from "../components/MarkdownEditorDialog";
import { ErrorState, PageLoader } from "../components/States";
import { PostMediaManager } from "../components/PostMediaManager";
import { usePageMeta } from "../hooks/usePageMeta";
import { useAuth } from "../contexts/AuthContext";
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
import {
  offlineDraftKey, readOfflineDraft, removeOfflineDraft, writeOfflineDraft,
} from "../lib/offlineDraft";

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

export function WritePage() {
  const { user } = useAuth();
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
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [bodyEditorOpen, setBodyEditorOpen] = useState(false);
  const [editorBody, setEditorBody] = useState("");
  const [editorBaseline, setEditorBaseline] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorUploading, setEditorUploading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [editorMessage, setEditorMessage] = useState("");
  const [editorExitConfirmOpen, setEditorExitConfirmOpen] = useState(false);
  const [preview, setPreview] = useState({ html: "", loading: false, error: "" });
  const [autosave, setAutosave] = useState({ status: "idle", message: "", savedAt: null });
  const [autosaveRetryKey, setAutosaveRetryKey] = useState(0);
  const [reloadConflictOpen, setReloadConflictOpen] = useState(false);
  const [offlineRecovery, setOfflineRecovery] = useState(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const bodyEditorRef = useRef(null);
  const inlineBodyRef = useRef(null);
  const editorBodyRef = useRef("");
  const pendingEditorSelectionRef = useRef(null);
  const pendingMediaInsertionRef = useRef(null);
  const mediaManagerRef = useRef(null);
  const initialPayload = draftPayloadFromForm(initialForm(requestedType, requestedCollection));
  const payloadRef = useRef(initialPayload);
  const savedPostRef = useRef(null);
  const lastSavedFingerprintRef = useRef(draftFingerprint(initialPayload));
  const autosaveBlockedRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const editorGenerationRef = useRef(0);
  const routeReadyRef = useRef(!postId);
  const offlineKeyRef = useRef("");
  const offlineFormRef = useRef(form);
  usePageMeta(postId ? "编辑记录" : "新建记录");

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useLayoutEffect(() => {
    const selection = pendingEditorSelectionRef.current;
    const editor = bodyEditorOpen ? bodyEditorRef.current : inlineBodyRef.current;
    if (!selection || !editor) return;

    pendingEditorSelectionRef.current = null;
    editor.focus();
    editor.setSelectionRange(selection[0], selection[1]);
  }, [bodyEditorOpen, editorBody, form.body]);

  useEffect(() => {
    let active = true;
    const generation = editorGenerationRef.current + 1;
    editorGenerationRef.current = generation;
    routeReadyRef.current = false;
    const storageKey = offlineDraftKey(user?.id, postId, requestedType, requestedCollection);
    offlineKeyRef.current = storageKey;
    setOfflineRecovery(null);
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
          const localCopy = readOfflineDraft(window.localStorage, storageKey);
          if (localCopy && draftFingerprint(draftPayloadFromForm(localCopy.form)) !== loadedFingerprint) {
            setOfflineRecovery(localCopy);
          } else if (localCopy) {
            removeOfflineDraft(window.localStorage, storageKey);
          }
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
      const localCopy = readOfflineDraft(window.localStorage, storageKey);
      if (localCopy && draftFingerprint(draftPayloadFromForm(localCopy.form)) !== freshFingerprint) {
        setOfflineRecovery(localCopy);
      }
      setAutosave({ status: "idle", message: "", savedAt: null });
      routeReadyRef.current = true;
      setLoading(false);
    }
    return () => { active = false; };
  }, [postId, reloadKey, requestedCollection, requestedType, user?.id]);

  useEffect(() => {
    if (!bodyEditorOpen) return undefined;
    const controller = new AbortController();
    setPreview((current) => ({ ...current, loading: true, error: "" }));
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.post("/posts/preview", { body: editorBody || "" }, { signal: controller.signal });
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
  }, [bodyEditorOpen, editorBody]);

  const isPublished = Boolean(savedPost?.published_at);
  const inCollection = Boolean(form.collection_id);
  const title = form.post_type === "article" ? "Article" : "Note";
  const inlineMediaIds = useMemo(
    () => mediaIdsInMarkdown(bodyEditorOpen ? editorBody : form.body),
    [bodyEditorOpen, editorBody, form.body],
  );
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

  useEffect(() => {
    if (loading || !routeReadyRef.current || offlineRecovery) return undefined;
    const localForm = bodyEditorOpen ? { ...form, body: editorBody } : form;
    offlineFormRef.current = localForm;
    const fingerprint = draftFingerprint(draftPayloadFromForm(localForm));
    if (fingerprint === lastSavedFingerprintRef.current) {
      removeOfflineDraft(window.localStorage, offlineKeyRef.current);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      writeOfflineDraft(window.localStorage, offlineKeyRef.current, localForm);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bodyEditorOpen, editorBody, form, loading, offlineRecovery]);

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
        if (currentMatches) removeOfflineDraft(window.localStorage, offlineKeyRef.current);
        if (!currentPost) {
          if (!currentMatches) {
            const nextKey = offlineDraftKey(user?.id, saved.id);
            if (writeOfflineDraft(window.localStorage, nextKey, offlineFormRef.current)) {
              removeOfflineDraft(window.localStorage, offlineKeyRef.current);
            }
          }
          navigate(`/write/${saved.id}`, { replace: true });
        }
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
  }, [navigate, user?.id]);

  const savedPostStatus = savedPost?.status;

  useEffect(() => {
    if (loading || bodyEditorOpen || !routeReadyRef.current || autosaveBlockedRef.current) return undefined;
    if (savedPostStatus && savedPostStatus !== "draft") return undefined;
    const fingerprint = draftFingerprint(payload);
    if (fingerprint === lastSavedFingerprintRef.current) return undefined;

    setAutosave((current) => ({ ...current, status: "dirty", message: "" }));
    const timer = window.setTimeout(() => {
      saveDraftSnapshot(payload, { automatic: true }).catch(() => {});
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [autosaveRetryKey, bodyEditorOpen, loading, payload, savedPostStatus, saveDraftSnapshot]);

  const set = (key) => (event) => {
    setError("");
    setMessage("");
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const restoreOfflineCopy = () => {
    if (!offlineRecovery?.form) return;
    const restored = offlineRecovery.form;
    setForm(restored);
    payloadRef.current = draftPayloadFromForm(restored);
    setAutosave({ status: "dirty", message: "已恢复浏览器本地副本，尚未保存到服务器。", savedAt: null });
    setMessage("已恢复浏览器本地副本，请确认内容后保存。 ");
    setOfflineRecovery(null);
  };

  const discardOfflineCopy = () => {
    removeOfflineDraft(window.localStorage, offlineKeyRef.current);
    setOfflineRecovery(null);
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

  const openBodyEditor = () => {
    const body = form.body || "";
    editorBodyRef.current = body;
    setEditorBody(body);
    setEditorBaseline(body);
    setEditorError("");
    setEditorMessage("");
    setPreview({ html: "", loading: false, error: "" });
    setBodyEditorOpen(true);
  };

  const updateEditorBody = (value) => {
    editorBodyRef.current = value;
    setEditorBody(value);
    setEditorError("");
    setEditorMessage("");
  };

  const saveEditorBody = async ({ close = false, showMessage = true, allowWhileUploading = false } = {}) => {
    if (editorSaving || (editorUploading && !allowWhileUploading)) return null;
    const body = editorBodyRef.current;
    const snapshot = { ...payloadRef.current, body: body || null };
    payloadRef.current = snapshot;
    setForm((current) => ({ ...current, body }));
    setEditorSaving(true);
    setEditorError("");
    if (showMessage) setEditorMessage("");
    try {
      const result = await saveDraftSnapshot(snapshot);
      setEditorBaseline(body);
      if (showMessage) setEditorMessage("草稿已保存，可以继续编辑。");
      if (close) setBodyEditorOpen(false);
      return result;
    } catch (saveError) {
      setEditorError(saveError.code === "EDIT_CONFLICT" ? "检测到其他窗口的修改，请先处理版本冲突。" : saveError.message);
      return null;
    } finally {
      setEditorSaving(false);
    }
  };

  const requestBodyEditorClose = () => {
    if (editorSaving || editorUploading) return;
    if (editorBodyRef.current !== editorBaseline) {
      setEditorExitConfirmOpen(true);
      return;
    }
    setBodyEditorOpen(false);
  };

  const discardBodyEditorChanges = () => {
    const body = editorBaseline;
    const snapshot = { ...payloadRef.current, body: body || null };
    editorBodyRef.current = body;
    payloadRef.current = snapshot;
    setEditorBody(body);
    setForm((current) => ({ ...current, body }));
    setEditorExitConfirmOpen(false);
    setBodyEditorOpen(false);
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
    const textarea = bodyEditorOpen ? bodyEditorRef.current : inlineBodyRef.current;
    const source = bodyEditorOpen ? editorBodyRef.current : form.body;
    const selectionStart = textarea ? textarea.selectionStart : source.length;
    const selectionEnd = textarea ? textarea.selectionEnd : selectionStart;
    const next = applyMarkdownShortcut(source, selectionStart, selectionEnd, action);
    pendingEditorSelectionRef.current = [next.selectionStart, next.selectionEnd];
    if (bodyEditorOpen) {
      editorBodyRef.current = next.value;
      setEditorBody(next.value);
      setEditorError("");
      setEditorMessage("");
    } else {
      setForm((current) => ({ ...current, body: next.value }));
      setError("");
      setMessage("");
    }
  };

  const handleBodyKeyDown = (event) => {
    const action = markdownActionForKeyEvent(event);
    if (!action) return;
    event.preventDefault();
    applyMarkdownFormat(action);
  };

  const insertMediaIntoBody = (mediaId) => {
    const textarea = bodyEditorRef.current;
    const pendingInsertion = pendingMediaInsertionRef.current;
    const selectionStart = pendingInsertion?.[0] ?? (bodyEditorOpen && textarea ? textarea.selectionStart : null);
    const selectionEnd = pendingInsertion?.[1] ?? (bodyEditorOpen && textarea ? textarea.selectionEnd : null);
    if (bodyEditorOpen) {
      const source = editorBodyRef.current;
      const start = selectionStart ?? source.length;
      const end = selectionEnd ?? start;
      const next = insertMediaPlaceholder(source, mediaId, start, end);
      editorBodyRef.current = next.value;
      pendingEditorSelectionRef.current = [next.cursor, next.cursor];
      if (pendingInsertion) pendingMediaInsertionRef.current = [next.cursor, next.cursor];
      setEditorBody(next.value);
      setEditorError("");
      setEditorMessage("图片已插入正文；取消编辑不会删除已经上传的媒体。");
      return;
    }
    setForm((current) => {
      const start = current.body.length;
      const next = insertMediaPlaceholder(current.body, mediaId, start, start);
      return { ...current, body: next.value };
    });
    setError("");
    setMessage("媒体已插入正文；保存草稿或发布后会永久保留这个位置。");
  };

  const removeMediaFromBody = (mediaIds) => {
    if (bodyEditorOpen) {
      const nextBody = removeMediaPlaceholders(editorBodyRef.current, mediaIds);
      editorBodyRef.current = nextBody;
      setEditorBody(nextBody);
    }
    setForm((current) => ({
      ...current,
      body: removeMediaPlaceholders(current.body, mediaIds),
    }));
  };

  const uploadInlineImages = async (files) => {
    const images = files.filter((file) => acceptedInlineImageTypes.has(file.type));
    if (!images.length) {
      setEditorError("只支持 JPEG、PNG 或 WebP 图片；Live Photo 请使用页面下方的配对上传。");
      return;
    }
    setEditorUploading(true);
    setEditorError("");
    setEditorMessage("");
    const textarea = bodyEditorRef.current;
    pendingMediaInsertionRef.current = bodyEditorOpen && textarea
      ? [textarea.selectionStart, textarea.selectionEnd]
      : null;
    try {
      const manager = mediaManagerRef.current;
      if (!manager?.uploadImageFile) throw new Error("图片上传组件尚未准备好，请稍后重试。");
      const currentPost = bodyEditorOpen
        ? await saveEditorBody({ showMessage: false, allowWhileUploading: true })
        : await persistDraft(false);
      if (!currentPost) return;
      for (const file of images) {
        await manager.uploadImageFile(file, {
          insertIntoBody: true,
          rethrow: true,
          postOverride: currentPost,
        });
      }
    } catch (uploadError) {
      setEditorError(uploadError.message || "图片上传失败，请重试。");
    } finally {
      pendingMediaInsertionRef.current = null;
      setEditorUploading(false);
    }
  };

  if (loading) return <PageLoader label="正在读取草稿" />;
  if (loadError) return <main className="page-shell narrow-page"><ErrorState error={loadError} onRetry={() => setReloadKey((value) => value + 1)} /></main>;

  return (
    <main className="page-shell editor-page">
      <header className="editor-heading editor-publication-bar">
        <Link className="editor-back-link" to="/me/posts">← 返回内容</Link>
        <div className="editor-document-identity">
          <span>写作台 · {form.post_type === "article" ? "文章" : "随记"}</span>
          <strong>{form.title.trim() || (postId ? "未命名草稿" : "一篇新的记录")}</strong>
          <small><i aria-hidden="true" />{autosaveStatusLabel(autosave, !savedPost || savedPost.status === "draft")}</small>
        </div>
        <div className="editor-top-actions">
          <button className="btn btn-secondary editor-settings-trigger" type="button" aria-expanded={publicationOpen} onClick={() => setPublicationOpen(true)}>
            发布设置
          </button>
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
      {!online ? <div className="inline-error editor-feedback" role="status">当前处于离线状态；修改会保存在此浏览器，联网后可继续保存到服务器。</div> : null}
      {offlineRecovery ? (
        <div className="inline-success editor-feedback offline-recovery" role="status">
          <span>发现 {new Date(offlineRecovery.saved_at).toLocaleString("zh-CN")} 保存的浏览器本地副本。</span>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" onClick={restoreOfflineCopy}>恢复本地副本</button>
            <button className="btn btn-secondary" type="button" onClick={discardOfflineCopy}>忽略并删除</button>
          </div>
        </div>
      ) : null}
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
          <section className={`editor-paper editor-paper-${form.post_type}`} aria-label={`${title} 写作画布`}>
            <div className="editor-paper-masthead">
              <div className="editor-paper-intro">
                <p>{postId ? "继续整理这份草稿" : "从一个标题开始"}</p>
                <span>{form.post_type === "article" ? "适合完整的叙述、思考与长内容。" : "适合记录此刻、地点与轻盈片段。"}</span>
              </div>
              <fieldset className="segmented-field editor-type-switch" disabled={isPublished}>
                <legend className="sr-only">内容类型</legend>
                <label className={form.post_type === "article" ? "selected" : ""}>
                  <input type="radio" name="post_type" value="article" checked={form.post_type === "article"}
                    onChange={() => setForm((current) => ({ ...current, post_type: "article", occurred_at: "", location: "", mood: "", external_video_url: "" }))} />
                  <span>文章 <small>Article</small></span>
                </label>
                <label className={form.post_type === "note" ? "selected" : ""}>
                  <input type="radio" name="post_type" value="note" checked={form.post_type === "note"}
                    onChange={() => setForm((current) => ({ ...current, post_type: "note", category_id: "", summary: "", slug: "" }))} />
                  <span>随记 <small>Note</small></span>
                </label>
                {isPublished ? <small>首次发布后类型锁定</small> : null}
              </fieldset>
            </div>

            <label className="editor-paper-field editor-title-field">
              <span>标题 · {form.post_type === "article" ? "发布时必填" : "可选"}</span>
              <input maxLength={240} value={form.title} onChange={set("title")} placeholder={form.post_type === "article" ? "写下文章标题" : "给片段一个标题"} />
            </label>

            <section className="editor-body-section" aria-labelledby="editor-body-heading">
              <div className="editor-body-toolbar">
                <div>
                  <span id="editor-body-heading">正文</span>
                  <small>直接写作；需要对照排版时再进入沉浸模式。</small>
                </div>
                <button className="btn btn-secondary" type="button" onClick={openBodyEditor}>进入沉浸写作 <span aria-hidden="true">↗</span></button>
              </div>
              <div className="markdown-shortcut-toolbar editor-inline-shortcuts" role="toolbar" aria-label="正文快捷操作">
                {MARKDOWN_SHORTCUTS.map((item) => <button key={item.action} className="markdown-shortcut-button" type="button" title={item.hint} aria-label={`${item.label}：${item.hint}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applyMarkdownFormat(item.action)}>{item.label}</button>)}
              </div>
              <textarea
                ref={inlineBodyRef}
                className="editor-body-textarea"
                value={form.body}
                spellCheck="true"
                onChange={set("body")}
                onKeyDown={handleBodyKeyDown}
                placeholder={form.post_type === "article" ? "从这里开始写下正文……" : "记下此刻发生的事……"}
                aria-describedby="editor-body-help"
              />
              <small id="editor-body-help" className="editor-body-help">图片与 Live Photo 使用安全的内部引用保存，不会在正文中暴露存储地址。</small>
            </section>

            {form.post_type === "article" ? (
              <details className="editor-abstract-drawer">
                <summary><span><small>可选信息</small><strong>添加文章摘要</strong></span><i aria-hidden="true">＋</i></summary>
                <label className="editor-paper-field editor-summary-field">
                  <span>摘要</span>
                  <textarea className="short-textarea" maxLength={500} value={form.summary} onChange={set("summary")} placeholder="用一两句话，为阅读留下入口。" />
                </label>
              </details>
            ) : (
              <details className="editor-abstract-drawer">
                <summary><span><small>可选信息</small><strong>补充时间、地点与心情</strong></span><i aria-hidden="true">＋</i></summary>
                <div className="editor-note-dateline" aria-label="随记发生信息">
                  <label><span>发生时间</span><input type="datetime-local" value={form.occurred_at} onChange={set("occurred_at")} /></label>
                  <label><span>地点</span><input maxLength={255} value={form.location} onChange={set("location")} placeholder="在哪里发生" /></label>
                  <label><span>心情</span><input maxLength={100} value={form.mood} onChange={set("mood")} placeholder="此刻的感受" /></label>
                </div>
              </details>
            )}
          </section>

          <details className="editor-media-drawer">
            <summary><span><small>素材</small><strong>图片与 Live Photo</strong></span><span>{savedPost?.bound_media?.length || 0} 项 <i aria-hidden="true">＋</i></span></summary>
            <div>
              <PostMediaManager
                ref={mediaManagerRef}
                post={savedPost}
                ensurePost={() => (bodyEditorOpen ? saveEditorBody({ showMessage: false }) : persistDraft(false))}
                onPostChange={handleMediaPostChange}
                onInsertMedia={insertMediaIntoBody}
                onRemoveMedia={removeMediaFromBody}
                inlineMediaIds={inlineMediaIds}
              />
            </div>
          </details>
        </div>

        {publicationOpen ? <>
        <button className="editor-sidebar-scrim" type="button" aria-label="关闭发布设置" onClick={() => setPublicationOpen(false)} />
        <aside className="editor-sidebar" aria-label="发布设置">
          <header className="editor-sidebar-heading"><div><p>发布设置 <small>PUBLICATION</small></p><h2>整理这篇记录</h2><span>补充归属与访问范围；这些信息不会打断正文写作。</span></div><button type="button" aria-label="关闭发布设置" onClick={() => setPublicationOpen(false)}>×</button></header>
          {optionsError ? <div className="inline-error" role="alert">{optionsError}</div> : null}
          <section className="editor-publication-status" aria-label="发布状态">
            <div className="editor-status"><span>内容状态</span><strong>{savedPost?.status || "未保存草稿"}</strong></div>
            <div className={`editor-status editor-save-status is-${autosave.status}`} aria-live="polite"><span>自动保存</span><strong>{autosaveStatusLabel(autosave, !savedPost || savedPost.status === "draft")}</strong></div>
            <div className="editor-status"><span>封面图片</span><strong>{savedPost?.cover_media_id ? "已设置" : "未设置"}</strong></div>
          </section>
          {form.post_type === "article" ? <section className="editor-sidebar-section">
            <header><span>01</span><strong>网址与分类</strong></header>
            <label>
              <span>文章网址</span>
              <input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} aria-invalid={Boolean(form.slug) && !slugPattern.test(form.slug.trim())} placeholder="article-slug" />
              <small>发布时必填；历史 Slug 由后端保留。</small>
            </label>
            <label>
              <span>分类</span>
              <CustomSelect value={form.category_id} onChange={set("category_id")}>
                <option value="">不设置 Category</option>
                {categoryUnavailable ? <option value={form.category_id}>{savedPost?.category?.name || "当前 Category"}（已停用）</option> : null}
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </CustomSelect>
            </label>
          </section> : <section className="editor-sidebar-section"><header><span>01</span><strong>延伸内容</strong></header><label><span>外部视频链接</span><input type="url" value={form.external_video_url} onChange={set("external_video_url")} aria-invalid={!validExternalUrl(form.external_video_url)} placeholder="https://" /></label></section>}

          <section className="editor-sidebar-section">
          <header><span>02</span><strong>归属与访问</strong></header>
          <label>
            <span>合集</span>
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
            <span>标签</span>
            <input value={form.tag_names} onChange={set("tag_names")} placeholder="学习, Python, 随想" />
            <small>使用英文逗号分隔，最多 20 个。</small>
          </label>
          </section>
        </aside>
        </> : null}
      </form>

      <MarkdownEditorDialog
        open={bodyEditorOpen}
        value={editorBody}
        dirty={editorBody !== editorBaseline}
        saving={editorSaving}
        uploading={editorUploading}
        error={editorError}
        message={editorMessage}
        preview={preview}
        media={savedPost?.bound_media || []}
        textareaRef={bodyEditorRef}
        shortcuts={MARKDOWN_SHORTCUTS}
        interactionBlocked={editorExitConfirmOpen}
        onChange={(event) => updateEditorBody(event.target.value)}
        onKeyDown={handleBodyKeyDown}
        onFormat={applyMarkdownFormat}
        onUploadImages={uploadInlineImages}
        onSave={() => saveEditorBody()}
        onSaveAndClose={() => saveEditorBody({ close: true })}
        onRequestClose={requestBodyEditorClose}
      />

      <ConfirmDialog
        open={editorExitConfirmOpen}
        title="放弃未保存的正文修改？"
        description="正文会恢复到最近一次成功保存的内容；已经上传的图片仍会保留在当前内容的媒体列表中。"
        confirmLabel="放弃修改"
        danger
        onConfirm={discardBodyEditorChanges}
        onClose={() => setEditorExitConfirmOpen(false)}
      />

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
