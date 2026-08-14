import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminActionDialog, AdminPageFrame, AdminStatus } from "../components/AdminPanel";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState } from "../components/States";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { adminTaxonomySearchParams, filterAdminTaxonomy, readAdminTaxonomyFilters } from "../lib/admin";
import { formatDate } from "../lib/format";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CONFIG = {
  category: {
    title: "Category",
    description: "维护稳定的主分类、排序与可用状态；首次被已发布内容使用后 Slug 永久锁定。",
    listPath: "/admin/categories",
    writePath: "/categories",
  },
  tag: {
    title: "Tag",
    description: "纠正、停用或合并成员创建的 Tag；合并只迁移关系，不删除 Post 或复用源 Slug。",
    listPath: "/admin/tags",
    writePath: "/tags",
  },
};

function editFormFrom(item, kind) {
  return {
    name: item.name || "",
    slug: item.slug || "",
    description: kind === "category" ? item.description || "" : "",
    sort_order: kind === "category" ? String(item.sort_order ?? 0) : "",
    reason: "",
  };
}

function TaxonomyFields({ kind, form, locked, disabled, onChange }) {
  return (
    <>
      <label><span>名称</span><input required maxLength={kind === "category" ? 100 : 80} value={form.name} disabled={disabled} onChange={(event) => onChange("name", event.target.value)} /></label>
      <label>
        <span>Slug</span>
        <input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={kind === "category" ? 120 : 100} value={form.slug} disabled={disabled || locked} onChange={(event) => onChange("slug", event.target.value.toLowerCase())} />
        {locked ? <small>已被发布内容使用，Slug 已锁定以保持历史 URL 稳定。</small> : null}
      </label>
      {kind === "category" ? <>
        <label className="admin-taxonomy-description"><span>说明</span><textarea rows={3} maxLength={500} value={form.description} disabled={disabled} onChange={(event) => onChange("description", event.target.value)} /></label>
        <label><span>排序值</span><input type="number" step="1" value={form.sort_order} disabled={disabled} onChange={(event) => onChange("sort_order", event.target.value)} /></label>
      </> : null}
    </>
  );
}

export function AdminTaxonomyPage({ kind }) {
  const config = CONFIG[kind];
  usePageMeta(`${config.title} 管理`);
  const [params, setParams] = useSearchParams();
  const filters = readAdminTaxonomyFilters(params);
  const [searchValue, setSearchValue] = useState(filters.q);
  const [editing, setEditing] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", slug: "", description: "", sort_order: "0", reason: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState("");
  const state = useAsyncData(() => api.get(config.listPath), [config.listPath]);
  const canonicalParams = adminTaxonomySearchParams(filters).toString();
  const filteredItems = useMemo(() => filterAdminTaxonomy(state.data, filters), [filters.q, filters.status, state.data]);

  useEffect(() => setSearchValue(filters.q), [filters.q]);
  useEffect(() => {
    if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true });
  }, [canonicalParams, params, setParams]);

  const updateFilters = (updates) => setParams(adminTaxonomySearchParams({ ...filters, ...updates }));
  const setCreateField = (key, value) => { setCreateError(""); setCreateForm((current) => ({ ...current, [key]: value })); };
  const setEditField = (key, value) => { setEditError(""); setEditing((current) => ({ ...current, form: { ...current.form, [key]: value } })); };
  const validateForm = (form, locked = false) => {
    if (!form.name.trim()) return "名称不能为空。";
    if (!locked && !SLUG_PATTERN.test(form.slug.trim())) return "Slug 只能使用小写字母、数字和连字符。";
    if (kind === "category" && !/^-?\d+$/.test(form.sort_order)) return "排序值必须是整数。";
    return "";
  };

  const createCategory = async () => {
    if (createBusy) return;
    const validation = validateForm(createForm);
    if (validation) { setCreateError(validation); return; }
    setCreateBusy(true); setCreateError(""); setMessage("");
    try {
      await api.post(config.writePath, {
        name: createForm.name.trim(), slug: createForm.slug.trim(),
        description: createForm.description.trim() || null,
        sort_order: Number(createForm.sort_order),
        reason: createForm.reason.trim() || undefined,
      });
      setCreateForm({ name: "", slug: "", description: "", sort_order: "0", reason: "" });
      setMessage("Category 已创建。");
      await state.reload();
    } catch (error) { setCreateError(error.message); }
    finally { setCreateBusy(false); }
  };

  const saveEdit = async () => {
    if (!editing || editBusy) return;
    const locked = Boolean(editing.item.first_used_at);
    const validation = validateForm(editing.form, locked);
    if (validation) { setEditError(validation); return; }
    setEditBusy(true); setEditError(""); setMessage("");
    const payload = {
      name: editing.form.name.trim(),
      reason: editing.form.reason.trim() || undefined,
    };
    if (!locked) payload.slug = editing.form.slug.trim();
    if (kind === "category") {
      payload.description = editing.form.description.trim() || null;
      payload.sort_order = Number(editing.form.sort_order);
    }
    try {
      await api.patch(`${config.writePath}/${editing.item.id}`, payload);
      setMessage(`已保存「${editing.form.name.trim()}」。`);
      setEditing(null);
      await state.reload();
    } catch (error) { setEditError(error.message); }
    finally { setEditBusy(false); }
  };

  const openAction = (type, item) => {
    setAction({ type, item }); setReason(""); setMergeTarget(""); setActionError(null); setMessage("");
  };
  const closeAction = () => { if (!actionBusy) setAction(null); };
  const confirmAction = async () => {
    if (!action || actionBusy || !reason.trim() || (action.type === "merge" && !mergeTarget)) return;
    setActionBusy(true); setActionError(null);
    try {
      if (action.type === "merge") {
        const target = (state.data || []).find((item) => String(item.id) === mergeTarget);
        await api.post(`${config.writePath}/${action.item.id}/merge`, { target_id: Number(mergeTarget), reason: reason.trim() });
        setMessage(`已将「${action.item.name}」合并到「${target?.name || `Tag #${mergeTarget}`}」。`);
      } else {
        const nextActive = !action.item.is_active;
        await api.patch(`${config.writePath}/${action.item.id}`, { is_active: nextActive, reason: reason.trim() });
        setMessage(`已${nextActive ? "恢复" : "停用"}「${action.item.name}」。`);
      }
      setAction(null); setEditing(null);
      await state.reload();
    } catch (error) { setActionError(error); }
    finally { setActionBusy(false); }
  };

  const mergeTargets = kind === "tag" && action?.type === "merge"
    ? (state.data || []).filter((item) => item.is_active && item.id !== action.item.id)
    : [];
  const actionIsMerge = action?.type === "merge";
  const nextActive = action && !actionIsMerge ? !action.item.is_active : false;

  return (
    <AdminPageFrame title={config.title} description={config.description} busy={state.loading || createBusy || editBusy || actionBusy} actions={<span className="personal-page-total tabular">共 {(state.data || []).length} 个</span>}>
      {kind === "category" ? <section className="admin-taxonomy-create" aria-labelledby="create-category-title">
        <div><p className="hero-kicker">Create</p><h2 id="create-category-title">新建 Category</h2><p>Category 数量应保持克制；Slug 在首次发布使用后不可修改。</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void createCategory(); }}>
          <TaxonomyFields kind={kind} form={createForm} disabled={createBusy} onChange={setCreateField} />
          <label className="admin-taxonomy-reason"><span>审计说明（可选）</span><input maxLength={500} value={createForm.reason} disabled={createBusy} onChange={(event) => setCreateField("reason", event.target.value)} /></label>
          {createError ? <div className="inline-error" role="alert">{createError}</div> : null}
          <button className="btn btn-primary" type="submit" disabled={createBusy}>{createBusy ? "正在创建…" : "创建 Category"}</button>
        </form>
      </section> : null}

      <form className="admin-content-filters admin-taxonomy-filters" role="search" onSubmit={(event) => { event.preventDefault(); updateFilters({ q: searchValue.trim() }); }}>
        <label className="admin-filter-search"><span>搜索 {config.title}</span><input type="search" maxLength={100} value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="名称、Slug 或说明" /></label>
        <label><span>状态</span><CustomSelect value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}><option value="">全部状态</option><option value="active">正常</option><option value="inactive">已停用</option></CustomSelect></label>
        <button className="btn btn-secondary" type="submit" disabled={state.loading}>搜索</button>
      </form>
      {message ? <div className="inline-success admin-feedback" role="status">{message}</div> : null}
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取 {config.title} 列表</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新 {config.title} 列表…</div> : null}
      {state.data ? filteredItems.length ? <div className="admin-content-list">
        {filteredItems.map((item) => (
          <article className="admin-content-row admin-taxonomy-row" key={item.id}>
            <div className="admin-content-main">
              <div className="admin-content-title"><h2>{kind === "tag" ? "#" : ""}{item.name}</h2><span className="tabular">#{item.id}</span></div>
              <div className="admin-user-badges"><AdminStatus value={item.is_active ? "active" : "inactive"} />{item.first_used_at ? <span className="admin-status">Slug 已锁定</span> : <span className="admin-status">Slug 可修改</span>}</div>
              {kind === "category" ? <p>{item.description || "无说明"}</p> : null}
              <small>/{kind === "category" ? "categories" : "tags"}/{item.slug}</small>
            </div>
            <dl className="admin-content-meta"><div><dt>关联 Post</dt><dd className="admin-content-count tabular">{item.post_count || 0}</dd></div>{kind === "category" ? <div><dt>排序</dt><dd className="tabular">{item.sort_order}</dd></div> : null}<div><dt>首次发布使用</dt><dd>{item.first_used_at ? <time dateTime={item.first_used_at}>{formatDate(item.first_used_at, true)}</time> : "尚未使用"}</dd></div><div><dt>更新</dt><dd><time dateTime={item.updated_at}>{formatDate(item.updated_at, true)}</time></dd></div></dl>
            <div className="admin-content-actions">
              <button className="btn btn-secondary btn-small" type="button" disabled={editBusy || actionBusy} aria-expanded={editing?.item.id === item.id} onClick={() => { setEditError(""); setEditing(editing?.item.id === item.id ? null : { item, form: editFormFrom(item, kind) }); }}>编辑</button>
              <button className={`btn ${item.is_active ? "btn-danger" : "btn-secondary"} btn-small`} type="button" disabled={editBusy || actionBusy} onClick={() => openAction("toggle", item)}>{item.is_active ? "停用" : "恢复"}</button>
              {kind === "tag" ? <button className="btn btn-secondary btn-small" type="button" disabled={editBusy || actionBusy || !(state.data || []).some((candidate) => candidate.is_active && candidate.id !== item.id)} onClick={() => openAction("merge", item)}>合并</button> : null}
            </div>
            {editing?.item.id === item.id ? <form className="admin-taxonomy-edit" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
              <TaxonomyFields kind={kind} form={editing.form} locked={Boolean(item.first_used_at)} disabled={editBusy} onChange={setEditField} />
              <label className="admin-taxonomy-reason"><span>审计说明（可选）</span><input maxLength={500} value={editing.form.reason} disabled={editBusy} onChange={(event) => setEditField("reason", event.target.value)} /></label>
              {editError ? <div className="inline-error" role="alert">{editError}</div> : null}
              <div className="admin-taxonomy-form-actions"><button className="btn btn-secondary" type="button" disabled={editBusy} onClick={() => setEditing(null)}>取消</button><button className="btn btn-primary" type="submit" disabled={editBusy}>{editBusy ? "正在保存…" : "保存修改"}</button></div>
            </form> : null}
          </article>
        ))}
      </div> : <EmptyState title={`没有匹配的 ${config.title}`} description="调整关键词或状态筛选后重试。" /> : null}

      <AdminActionDialog
        open={Boolean(action)}
        title={actionIsMerge ? "合并 Tag" : `${nextActive ? "恢复" : "停用"} ${config.title}`}
        description={actionIsMerge ? "源 Tag 会停用，全部 Post 关系迁移到目标 Tag；源 Slug 会保留但不再出现在成员入口。" : nextActive ? `恢复后成员可以再次选择并浏览这个 ${config.title}。` : `停用不会删除历史 Post，但成员不能再选择或从聚合入口浏览这个 ${config.title}。`}
        confirmLabel={actionIsMerge ? "确认合并" : nextActive ? "确认恢复" : "确认停用"}
        reason={reason}
        busy={actionBusy}
        error={actionError?.message}
        confirmDisabled={actionIsMerge && !mergeTarget}
        onReasonChange={setReason}
        onConfirm={() => { void confirmAction(); }}
        onClose={closeAction}
      >
        {actionIsMerge ? <label><span>目标 Tag</span><CustomSelect data-autofocus value={mergeTarget} disabled={actionBusy} onChange={(event) => setMergeTarget(event.target.value)}><option value="">选择目标 Tag</option>{mergeTargets.map((item) => <option key={item.id} value={item.id}>{item.name} · /tags/{item.slug}</option>)}</CustomSelect><small>只能合并到仍为正常状态的另一个 Tag。</small></label> : null}
      </AdminActionDialog>
    </AdminPageFrame>
  );
}

export function AdminCategoriesPage() {
  return <AdminTaxonomyPage kind="category" />;
}

export function AdminTagsPage() {
  return <AdminTaxonomyPage kind="tag" />;
}
