import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { CollectionCoverManager } from "../components/CollectionCoverManager";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorState, PageLoader } from "../components/States";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { collectionMemberSettingsPayload } from "../lib/collectionMembership";
import { formatDate, postHref, postTypeLabel } from "../lib/format";

function memberIds(members) {
  return (members || []).map((member) => member.id);
}

export function CollectionManagePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collection, setCollection] = useState(null);
  const [members, setMembers] = useState([]);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [autoAddFutureMembers, setAutoAddFutureMembers] = useState(false);
  const [orderedPosts, setOrderedPosts] = useState([]);
  const [highlightIds, setHighlightIds] = useState([]);
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);
  usePageMeta(collection ? `管理 ${collection.name}` : "管理 Collection");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    api.get(`/collections/${encodeURIComponent(slug)}`)
      .then(async (result) => {
        if (!active) return;
        const current = result.data;
        setCollection(current);
        setOrderedPosts(current.posts || []);
        setHighlightIds((current.highlights || []).map((post) => post.id));
        setForm({ name: current.name || "", slug: current.slug || "", description: current.description || "" });
        setAutoAddFutureMembers(Boolean(current.auto_add_future_members));
        if (current.creator.id !== user.id) {
          setLoading(false);
          return;
        }
        const [memberResult, optionResult] = await Promise.all([
          api.get(`/collections/${current.id}/members`),
          api.get("/collections/member-options"),
        ]);
        if (!active) return;
        setMembers(memberResult.data.members || []);
        const activeOptions = optionResult.data || [];
        const activeIds = new Set(activeOptions.map((member) => member.id));
        setSelected(memberIds(memberResult.data.members).filter((id) => activeIds.has(id)));
        setOptions(activeOptions);
        setLoading(false);
      })
      .catch((failure) => {
        if (!active) return;
        setLoadError(failure);
        setLoading(false);
      });
    return () => { active = false; };
  }, [slug, user.id, reloadKey]);

  const displayedOptions = useMemo(() => {
    const byId = new Map(options.map((member) => [member.id, member]));
    members.forEach((member) => {
      if (!byId.has(member.id)) byId.set(member.id, { ...member, unavailable: true });
    });
    return [...byId.values()];
  }, [members, options]);

  const activeOptionIds = useMemo(() => options.map((member) => member.id), [options]);
  const desiredMemberIds = selectAll ? activeOptionIds : selected;

  const toggleMember = (id) => {
    const base = selectAll ? activeOptionIds : selected;
    setSelectAll(false);
    setSelected(base.includes(id) ? base.filter((value) => value !== id) : [...base, id]);
    setMessage("");
    setError("");
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    setBusy("details");
    setMessage("");
    setError("");
    try {
      const result = await api.patch(`/collections/${collection.id}`, {
        name: form.name,
        description: form.description || null,
        ...(collection.first_shared_at ? {} : { slug: form.slug }),
      });
      setCollection((current) => ({ ...current, ...result.data, posts: current.posts }));
      setMessage("Collection 资料已保存。");
      if (result.data.slug !== slug) navigate(`/collections/${result.data.slug}/manage`, { replace: true });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy("");
    }
  };

  const requestMemberSave = () => {
    const desired = new Set(desiredMemberIds);
    const removed = members.filter((member) => !desired.has(member.id));
    if (removed.length) {
      setConfirm({ type: "members", removed });
    } else {
      saveMembers();
    }
  };

  const saveMembers = async () => {
    setBusy("members");
    setMessage("");
    setError("");
    try {
      const result = await api.put(
        `/collections/${collection.id}/members`,
        collectionMemberSettingsPayload({ selectAll, selected, autoAddFutureMembers }),
      );
      const nextCollection = result.data.collection;
      setCollection((current) => ({ ...current, ...nextCollection, posts: current.posts }));
      setMembers(nextCollection.members || []);
      setSelected(memberIds(nextCollection.members));
      setSelectAll(false);
      setConfirm(null);
      const added = result.data.changes.added.length;
      const removed = result.data.changes.removed.length;
      setMessage(`成员名单已更新：新增 ${added} 人，移除 ${removed} 人。`);
    } catch (memberError) {
      setError(memberError.message);
    } finally {
      setBusy("");
    }
  };

  const movePost = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= orderedPosts.length) return;
    setOrderedPosts((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setMessage("");
  };

  const saveOrder = async () => {
    setBusy("order");
    setMessage("");
    setError("");
    try {
      await api.post(`/collections/${collection.id}/reorder`, { post_ids: orderedPosts.map((post) => post.id) });
      setCollection((current) => ({ ...current, posts: orderedPosts }));
      setMessage("Collection 内容顺序已保存。");
    } catch (orderError) {
      setError(orderError.message);
    } finally {
      setBusy("");
    }
  };

  const toggleHighlight = (postId) => {
    setError("");
    setMessage("");
    setHighlightIds((current) => {
      if (current.includes(postId)) return current.filter((id) => id !== postId);
      if (current.length >= 6) {
        setError("关键记录最多选择 6 条。");
        return current;
      }
      return [...current, postId];
    });
  };

  const moveHighlight = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= highlightIds.length) return;
    setHighlightIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveHighlights = async () => {
    setBusy("highlights");
    setMessage("");
    setError("");
    try {
      const result = await api.put(`/collections/${collection.id}/highlights`, { post_ids: highlightIds });
      setHighlightIds(result.data.post_ids || []);
      setCollection((current) => ({ ...current, highlights: result.data.highlights || [] }));
      setMessage("关键记录已保存。它们只影响 Collection 回忆入口，不改变正文与作者归属。");
    } catch (highlightError) {
      setError(highlightError.message);
    } finally {
      setBusy("");
    }
  };

  const removePost = async () => {
    const post = confirm?.post;
    if (!post) return;
    setBusy("remove-post");
    setMessage("");
    setError("");
    try {
      await api.post(`/collections/${collection.id}/remove-post`, { post_id: post.id });
      setOrderedPosts((current) => current.filter((item) => item.id !== post.id));
      setHighlightIds((current) => current.filter((id) => id !== post.id));
      setCollection((current) => ({ ...current, posts: current.posts.filter((item) => item.id !== post.id) }));
      setConfirm(null);
      setMessage("Post 已移出 Collection，并恢复为作者私有内容。");
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy("");
    }
  };

  const deleteCollection = async () => {
    setBusy("delete");
    setError("");
    try {
      await api.delete(`/collections/${collection.id}`);
      navigate("/collections", { replace: true });
    } catch (deleteError) {
      setError(deleteError.message);
      setConfirm(null);
    } finally {
      setBusy("");
    }
  };

  const handleCoverChange = async (nextCollection) => {
    setCollection((current) => ({ ...current, ...nextCollection, posts: current.posts }));
  };

  if (loading) return <PageLoader label="正在读取 Collection 管理数据" />;
  if (loadError) return <main className="page-shell narrow-page"><ErrorState error={loadError} onRetry={() => setReloadKey((value) => value + 1)} /></main>;
  if (collection.creator.id !== user.id) return <Navigate to={`/collections/${collection.slug}`} replace />;

  return (
    <main className="page-shell collection-manage-page">
      <header className="page-heading">
        <div>
          <p className="hero-kicker">Collection 管理</p>
          <h1>{collection.name}</h1>
          <p>创建者可以管理资料、成员与内容顺序，但不能编辑或删除其他作者的 Post。</p>
        </div>
        <Link className="btn btn-secondary" to={`/collections/${collection.slug}`}>返回 Collection</Link>
      </header>

      {message ? <div className="inline-success collection-manage-feedback" role="status">{message}</div> : null}
      {error ? <div className="inline-error collection-manage-feedback" role="alert">{error}</div> : null}

      <div className="collection-manage-layout">
        <div className="collection-manage-main">
          <section className="collection-manage-section">
            <h2>基本资料</h2>
            <form className="editor-form" onSubmit={saveDetails}>
              <label><span>名称</span><input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>
                <span>Slug</span>
                <input required disabled={Boolean(collection.first_shared_at)} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })} />
                <small>{collection.first_shared_at ? `已于 ${formatDate(collection.first_shared_at, true)} 首次共享，Slug 已锁定。` : "首次发布 Collection 内容前可以修改。"}</small>
              </label>
              <label><span>说明</span><textarea maxLength={5000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>{busy === "details" ? "正在保存" : "保存资料"}</button>
            </form>
          </section>

          <section className="collection-manage-section">
            <div className="section-header">
              <div><h2>关键记录</h2><p>最多选择 6 条共同片段，并用上下移动确定展示顺序。</p></div>
              <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={saveHighlights}>{busy === "highlights" ? "正在保存" : "保存关键记录"}</button>
            </div>
            {orderedPosts.length ? <div className="collection-highlight-picker">
              {orderedPosts.map((post) => {
                const highlightIndex = highlightIds.indexOf(post.id);
                return <article key={post.id} className={highlightIndex >= 0 ? "selected" : ""}>
                  <label className="check-row"><input type="checkbox" checked={highlightIndex >= 0} disabled={Boolean(busy)} onChange={() => toggleHighlight(post.id)} /><span>{post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")} <small>{post.author?.nickname}</small></span></label>
                  {highlightIndex >= 0 ? <div className="collection-order-actions"><span className="collection-order-number tabular">{String(highlightIndex + 1).padStart(2, "0")}</span><button className="btn btn-secondary" type="button" disabled={highlightIndex === 0 || Boolean(busy)} onClick={() => moveHighlight(highlightIndex, -1)}>上移</button><button className="btn btn-secondary" type="button" disabled={highlightIndex === highlightIds.length - 1 || Boolean(busy)} onClick={() => moveHighlight(highlightIndex, 1)}>下移</button></div> : null}
                </article>;
              })}
            </div> : <div className="collection-manage-empty">发布共同内容后，可以从这里挑选关键记录。</div>}
          </section>

          <section className="collection-manage-section">
            <div className="section-header">
              <div><h2>共同成员</h2><p>成员关系同时决定阅读权和投稿权。</p></div>
              <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={requestMemberSave}>{busy === "members" ? "正在保存" : "保存成员"}</button>
            </div>
            <fieldset className="member-fieldset">
              <legend>成员名单</legend>
              <label className="check-row">
                <input type="checkbox" checked={selectAll} onChange={(event) => {
                  setSelectAll(event.target.checked);
                  if (!event.target.checked) setSelected(memberIds(members).filter((id) => activeOptionIds.includes(id)));
                }} />
                <span>保存时选择当前所有有效成员</span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={autoAddFutureMembers} onChange={(event) => {
                  setAutoAddFutureMembers(event.target.checked);
                  setMessage("");
                  setError("");
                }} />
                <span>自动邀请未来加入映墨的成员 <small>开启后，新注册成员可阅读并投稿；关闭不会移除已加入成员</small></span>
              </label>
              <div className="member-options">
                {displayedOptions.map((member) => (
                  <label className={`check-row ${member.unavailable ? "member-unavailable" : ""}`} key={member.id}>
                    <input type="checkbox" disabled={member.unavailable || selectAll} checked={member.unavailable ? false : selectAll || selected.includes(member.id)} onChange={() => toggleMember(member.id)} />
                    <span>{member.nickname} <small>@{member.username}{member.unavailable ? " · 保存时将移除" : ""}</small></span>
                  </label>
                ))}
              </div>
              {!displayedOptions.length ? <p className="meta-text">当前没有其他有效成员可供选择。</p> : null}
            </fieldset>
          </section>

          <section className="collection-manage-section">
            <div className="section-header">
              <div><h2>内容顺序</h2><p>上下移动后保存，排序请求会完整覆盖当前可展示 Post。</p></div>
              {orderedPosts.length ? <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={saveOrder}>{busy === "order" ? "正在保存" : "保存顺序"}</button> : null}
            </div>
            {orderedPosts.length ? (
              <div className="collection-order-list">
                {orderedPosts.map((post, index) => (
                  <article key={post.id}>
                    <span className="collection-order-number tabular">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <span className="meta-text">{postTypeLabel(post.post_type)} · {post.author?.nickname}</span>
                      <h3><Link to={postHref(post)}>{post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")}</Link></h3>
                    </div>
                    <div className="collection-order-actions">
                      <button className="btn btn-secondary" type="button" disabled={index === 0 || Boolean(busy)} onClick={() => movePost(index, -1)}>上移</button>
                      <button className="btn btn-secondary" type="button" disabled={index === orderedPosts.length - 1 || Boolean(busy)} onClick={() => movePost(index, 1)}>下移</button>
                      {post.author?.id === user.id ? <Link className="btn btn-secondary" to={`/write/${post.id}`}>编辑</Link> : null}
                      <button className="text-button danger-text" type="button" disabled={Boolean(busy)} onClick={() => setConfirm({ type: "post", post })}>移出</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="collection-manage-empty">当前没有可排序的已发布或已归档内容。</div>}
          </section>
        </div>

        <aside className="collection-manage-aside">
          <CollectionCoverManager collection={collection} onChange={handleCoverChange} />
          <section className="collection-danger-zone">
            <h2>删除 Collection</h2>
            <p>所有 Post 会安全脱离并恢复为作者私有内容，不会转移作者身份。</p>
            <button className="btn btn-danger" type="button" disabled={Boolean(busy)} onClick={() => setConfirm({ type: "delete" })}>删除 Collection</button>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.type === "members" ? "移除选中的共同成员？" : confirm?.type === "post" ? "将这篇 Post 移出 Collection？" : "删除这个 Collection？"}
        description={confirm?.type === "members"
          ? `将移除 ${confirm.removed.map((member) => member.nickname).join("、")}。他们会立即失去普通阅读和投稿权限，但仍可通过作者入口管理自己的历史 Post。`
          : confirm?.type === "post"
            ? "Post 会脱离 Collection 并恢复为作者私有内容；创建者不会获得该 Post 的编辑或删除权限。"
            : "Collection 将被删除，所有 Post 会脱离并恢复为各自作者的私有内容。此操作无法在前端撤销。"}
        confirmLabel={confirm?.type === "members" ? "确认更新成员" : confirm?.type === "post" ? "确认移出" : "确认删除"}
        danger
        busy={Boolean(busy)}
        onConfirm={confirm?.type === "members" ? saveMembers : confirm?.type === "post" ? removePost : deleteCollection}
        onClose={() => !busy && setConfirm(null)}
      />
    </main>
  );
}
