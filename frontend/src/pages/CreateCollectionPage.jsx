import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { usePageMeta } from "../hooks/usePageMeta";
import { collectionMemberSettingsPayload } from "../lib/collectionMembership";

export function CreateCollectionPage() {
  usePageMeta("创建合集");
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [selectAll, setSelectAll] = useState(false);
  const [autoAddFutureMembers, setAutoAddFutureMembers] = useState(false);
  const [status, setStatus] = useState({ busy: false, error: "" });
  const [memberState, setMemberState] = useState({ loading: true, error: "", reload: 0 });

  useEffect(() => {
    let active = true;
    setMemberState((current) => ({ ...current, loading: true, error: "" }));
    api.get("/collections/member-options")
      .then((result) => {
        if (!active) return;
        setMembers(result.data || []);
        setMemberState((current) => ({ ...current, loading: false, error: "" }));
      })
      .catch((error) => {
        if (!active) return;
        setMembers([]);
        setMemberState((current) => ({ ...current, loading: false, error: error.message }));
      });
    return () => { active = false; };
  }, [memberState.reload]);

  const toggle = (id) => {
    setSelectAll(false);
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ busy: true, error: "" });
    try {
      const result = await api.post("/collections", {
        name: form.name,
        slug: form.slug,
        description: form.description || null,
        ...collectionMemberSettingsPayload({ selectAll, selected, autoAddFutureMembers }),
      });
      navigate(`/collections/${result.data.slug}`, { replace: true });
    } catch (error) {
      setStatus({ busy: false, error: error.message });
    }
  };

  return (
    <main className="page-shell narrow-page">
      <header className="page-heading">
        <div>
          <h1>创建 Collection</h1>
          <p>成员名单同时决定阅读权和投稿权。一键全选只保存当前时刻的成员快照。</p>
        </div>
      </header>

      <form className="editor-form" onSubmit={submit}>
        {status.error ? <div className="inline-error" role="alert">{status.error}</div> : null}
        <label>
          <span>名称</span>
          <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          <span>Slug</span>
          <input required placeholder="trip-2026" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })} aria-invalid={Boolean(form.slug) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)} />
          <small>首次共享后后端会锁定 Slug。</small>
        </label>
        <label>
          <span>说明</span>
          <textarea maxLength={5000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>

        <fieldset className="member-fieldset">
          <legend>共同成员</legend>
          {memberState.error ? (
            <div className="inline-error" role="alert">
              <p>{memberState.error}</p>
              <button className="btn btn-secondary" type="button" onClick={() => setMemberState((current) => ({ ...current, reload: current.reload + 1 }))}>重新读取成员</button>
            </div>
          ) : null}
          <label className="check-row">
            <input type="checkbox" disabled={memberState.loading || Boolean(memberState.error)} checked={selectAll} onChange={(event) => {
              setSelectAll(event.target.checked);
              if (event.target.checked) setSelected([]);
            }} />
            <span>选择当前所有其他成员</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={autoAddFutureMembers} onChange={(event) => setAutoAddFutureMembers(event.target.checked)} />
            <span>自动邀请未来加入映墨的成员 <small>新注册成员将可阅读并向此 Collection 投稿</small></span>
          </label>
          {!selectAll ? (
            <div className="member-options">
              {members.map((member) => (
                <label className="check-row" key={member.id}>
                  <input type="checkbox" checked={selected.includes(member.id)} onChange={() => toggle(member.id)} />
                  <span>{member.nickname} <small>@{member.username}</small></span>
                </label>
              ))}
            </div>
          ) : null}
          {memberState.loading ? <p className="meta-text" role="status">正在读取可选成员。</p> : null}
          {!memberState.loading && !memberState.error && !members.length ? <p className="meta-text">当前没有其他有效成员，仍可创建个人 Collection。</p> : null}
        </fieldset>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={status.busy}>{status.busy ? "创建中" : "创建合集"}</button>
        </div>
      </form>
    </main>
  );
}
