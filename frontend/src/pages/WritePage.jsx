import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorState, PageLoader } from "../components/States";
import { PostMediaManager } from "../components/PostMediaManager";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  usePageMeta(postId ? "编辑记录" : "新建记录");

  useEffect(() => {
    let active = true;
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
          setSavedPost(result.data);
          setForm(formFromPost(result.data));
          setLoading(false);
        })
        .catch((loadFailure) => {
          if (!active) return;
          setLoadError(loadFailure);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => { active = false; };
  }, [postId, reloadKey]);

  const isPublished = Boolean(savedPost?.published_at);
  const inCollection = Boolean(form.collection_id);
  const title = form.post_type === "article" ? "Article" : "Note";
  const collectionUnavailable = Boolean(
    form.collection_id && !collections.some((collection) => String(collection.id) === form.collection_id)
  );
  const categoryUnavailable = Boolean(
    form.category_id && !categories.some((category) => String(category.id) === form.category_id)
  );

  const payload = useMemo(() => {
    const tagNames = form.tag_names
      ? form.tag_names.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
    const common = {
      post_type: form.post_type,
      body: form.body || null,
      visibility: inCollection ? "private" : form.visibility,
      collection_id: form.collection_id ? Number(form.collection_id) : null,
      tag_names: tagNames,
    };
    if (form.post_type === "article") {
      return {
        ...common,
        title: form.title || null,
        summary: form.summary || null,
        slug: form.slug || null,
        category_id: form.category_id ? Number(form.category_id) : null,
      };
    }
    return {
      ...common,
      title: form.title || null,
      summary: form.summary || null,
      occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : null,
      location: form.location || null,
      mood: form.mood || null,
      external_video_url: form.external_video_url || null,
    };
  }, [form, inCollection]);

  const set = (key) => (event) => {
    setError("");
    setMessage("");
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const persistDraft = async (showMessage = true, navigateCreated = true) => {
    setBusy(true);
    setError("");
    if (showMessage) setMessage("");
    try {
      const result = savedPost
        ? await api.patch(`/posts/${savedPost.id}`, payload)
        : await api.post("/posts", payload);
      setSavedPost(result.data);
      if (showMessage) setMessage(savedPost ? "修改已保存。" : "草稿已保存。");
      if (!savedPost && navigateCreated) {
        navigate(`/write/${result.data.id}`, { replace: true });
      }
      return result.data;
    } catch (saveError) {
      setError(saveError.message);
      return null;
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
      let post = savedPost;
      if (!post) {
        const created = await api.post("/posts", payload);
        post = created.data;
      } else {
        const updated = await api.patch(`/posts/${post.id}`, payload);
        post = updated.data;
      }
      const published = await api.post(`/posts/${post.id}/publish`, form.post_type === "article" ? { slug: form.slug.trim() } : {});
      navigate(published.data.post_type === "article" ? `/articles/${published.data.slug}` : `/notes/${published.data.id}`, { replace: true });
    } catch (publishError) {
      setError(publishError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMediaPostChange = (post) => {
    setSavedPost(post);
    if (!postId) navigate(`/write/${post.id}`, { replace: true });
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
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => persistDraft(true, true)}>
            {busy ? "正在保存" : savedPost ? "保存修改" : "保存草稿"}
          </button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={publish}>
            {busy ? "正在处理" : savedPost?.status === "archived" ? "重新发布" : savedPost?.status === "published" ? "保存并发布" : "发布"}
          </button>
        </div>
      </header>

      {error ? <div className="inline-error editor-feedback" role="alert">{error}</div> : null}
      {message ? <div className="inline-success editor-feedback" role="status">{message}</div> : null}

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
              <div className="form-grid">
                <label>
                  <span>Slug</span>
                  <input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} aria-invalid={Boolean(form.slug) && !slugPattern.test(form.slug.trim())} />
                  <small>发布时必填；历史 Slug 由后端保留。</small>
                </label>
                <label>
                  <span>Category</span>
                  <select value={form.category_id} onChange={set("category_id")}>
                    <option value="">不设置 Category</option>
                    {categoryUnavailable ? <option value={form.category_id}>{savedPost?.category?.name || "当前 Category"}（已停用）</option> : null}
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <div className="form-grid">
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

          <label>
            <span>正文</span>
            <textarea className="body-editor" value={form.body} onChange={set("body")} placeholder="支持 Markdown。" />
          </label>

          <PostMediaManager post={savedPost} ensurePost={() => persistDraft(false, false)} onPostChange={handleMediaPostChange} />
        </div>

        <aside className="editor-sidebar">
          {optionsError ? <div className="inline-error" role="alert">{optionsError}</div> : null}
          <label>
            <span>Collection</span>
            <select value={form.collection_id} onChange={set("collection_id")}>
              <option value="">不加入 Collection</option>
              {collectionUnavailable ? <option value={form.collection_id}>原 Collection（当前不可访问）</option> : null}
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select>
            {collectionUnavailable
              ? <small className="field-error">你已不在原 Collection 中。仍可编辑，但发布前必须先移出。</small>
              : <small>只能选择你当前有权进入和投稿的 Collection。</small>}
          </label>

          <label>
            <span>独立内容可见性</span>
            <select disabled={inCollection} value={inCollection ? "private" : form.visibility} onChange={set("visibility")}>
              <option value="private">仅自己</option>
              <option value="login_only">所有登录成员</option>
            </select>
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
          {savedPost?.cover_media_id ? <div className="editor-status"><span>封面</span><strong>已设置</strong></div> : null}
        </aside>
      </form>
    </main>
  );
}
