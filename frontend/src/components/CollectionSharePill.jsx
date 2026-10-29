import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { collectionMemberSettingsPayload } from "../lib/collectionMembership";
import { DefaultAvatar } from "./DefaultAvatar";
import { ProtectedImage } from "./ProtectedImage";

function Avatar({ member }) {
  return <span className="collection-share-avatar" aria-hidden="true"><ProtectedImage media={member.avatar_media} alt="" fallback={<DefaultAvatar />} /></span>;
}

function ShareIcon({ invite = false }) {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {invite ? <><path d="M13 6h6m-3-3v6M3 17v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" /><circle cx="8" cy="5" r="3" /></> : <><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M12 4V3H3v9h1" /></>}
  </svg>;
}

export function CollectionSharePill({ collection, user, onMembersChange }) {
  const id = useId();
  const [panel, setPanel] = useState("");
  const [roster, setRoster] = useState(null);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [feedback, setFeedback] = useState({ text: "", error: false });
  const mounted = useRef(false);
  const loadRequest = useRef(0);
  const saveLock = useRef(false);
  const copyLock = useRef(false);
  const root = useRef(null);
  const memberTrigger = useRef(null);
  const inviteTrigger = useRef(null);
  const panelHeading = useRef(null);
  const searchInput = useRef(null);
  const isCreator = collection.creator.id === user.id;
  const members = [...new Map([collection.creator, ...(collection.members || [])].map((member) => [member.id, member])).values()];
  const currentMembers = roster?.members || [];
  const joinedIds = new Set([collection.creator.id, ...currentMembers.map((member) => member.id)]);
  const activeIds = new Set(options.map((member) => member.id));
  const unavailable = currentMembers.filter((member) => !activeIds.has(member.id));
  const candidates = options.filter((member) => !joinedIds.has(member.id));
  const search = query.trim().toLocaleLowerCase();
  const filtered = candidates.filter((member) => `${member.nickname || ""} ${member.username || ""}`.toLocaleLowerCase().includes(search));
  const canonicalUrl = new URL(`/collections/${collection.slug}`, window.location.origin).href;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadRequest.current += 1; };
  }, []);

  useEffect(() => {
    if (panel === "invite") searchInput.current?.focus();
    if (panel === "members") panelHeading.current?.focus();
  }, [panel]);

  const closePanel = () => {
    loadRequest.current += 1;
    setLoading(false);
    setPanel("");
    (panel === "invite" ? inviteTrigger : memberTrigger).current?.focus();
  };

  const loadInvite = async () => {
    if (!isCreator || saveLock.current) return;
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError("");
    setSaveError("");
    try {
      const [memberResult, optionResult] = await Promise.all([
        api.get(`/collections/${collection.id}/members`),
        api.get("/collections/member-options"),
      ]);
      if (!mounted.current || request !== loadRequest.current) return;
      if (memberResult.data.creator.id !== user.id) throw new Error("合集创建者已变更，请刷新页面后查看。");
      setRoster(memberResult.data);
      setOptions(optionResult.data || []);
    } catch (error) {
      if (mounted.current && request === loadRequest.current) setLoadError(error.message);
    } finally {
      if (mounted.current && request === loadRequest.current) setLoading(false);
    }
  };

  const openInvite = () => {
    if (panel === "invite") { closePanel(); return; }
    setPanel("invite");
    setQuery("");
    if (!saveLock.current) {
      setSelected([]);
      void loadInvite();
    }
  };

  const toggleMembers = () => {
    if (panel === "members") { closePanel(); return; }
    loadRequest.current += 1;
    setLoading(false);
    setPanel("members");
  };

  const copyLink = async () => {
    if (copyLock.current) return;
    copyLock.current = true;
    setCopying(true);
    setFeedback({ text: "", error: false });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(canonicalUrl);
      if (mounted.current) setFeedback({ text: "链接已复制", error: false });
    } catch {
      if (mounted.current) setFeedback({ text: "复制失败，请从下方地址框手动复制。", error: true });
    } finally {
      copyLock.current = false;
      if (mounted.current) setCopying(false);
    }
  };

  const saveMembers = async (event) => {
    event.preventDefault();
    if (!isCreator || saveLock.current || loading || loadError || !roster || unavailable.length || !selected.length) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError("");
    setFeedback({ text: "", error: false });
    try {
      // PUT replaces the whole roster. Re-read immediately before merging additions.
      const [memberResult, optionResult] = await Promise.all([
        api.get(`/collections/${collection.id}/members`),
        api.get("/collections/member-options"),
      ]);
      if (!mounted.current) return;
      const latest = memberResult.data;
      const latestOptions = optionResult.data || [];
      const validIds = new Set(latestOptions.map((member) => member.id));
      if (latest.creator.id !== user.id) throw new Error("合集创建者已变更，请刷新页面后查看。");
      if (latest.members.some((member) => !validIds.has(member.id))) {
        setRoster(latest);
        setOptions(latestOptions);
        throw new Error("当前名单中有不可用成员，请先到合集管理页面核对。");
      }
      if (selected.some((memberId) => !validIds.has(memberId))) {
        throw new Error("选中的用户已不可用，请取消该选择后重试，或重新打开面板获取名单。");
      }
      const memberIds = [...new Set([...latest.members.map((member) => member.id), ...selected])];
      const result = await api.put(`/collections/${collection.id}/members`, collectionMemberSettingsPayload({
        selected: memberIds,
        autoAddFutureMembers: collection.auto_add_future_members,
      }));
      if (!mounted.current) return;
      const next = result.data.collection;
      const restoreFocus = root.current?.contains(document.activeElement);
      onMembersChange(next);
      setRoster({ creator: next.creator, members: next.members || [] });
      setSelected([]);
      setQuery("");
      setPanel("");
      setFeedback({ text: "共同记录者已更新", error: false });
      // Closing while saving is allowed; avoid moving focus if the user left the panel.
      if (restoreFocus) inviteTrigger.current?.focus();
    } catch (error) {
      if (mounted.current) setSaveError(error.message);
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <div ref={root} className={`collection-share ${isCreator ? "is-creator" : ""}`} onKeyDown={(event) => {
    if (event.key === "Escape" && panel) { event.preventDefault(); event.stopPropagation(); closePanel(); }
  }}>
    <div className="collection-share-pill" role="group" aria-label="合集成员与分享">
      <button ref={memberTrigger} type="button" className="collection-share-members" aria-expanded={panel === "members"} aria-controls={`${id}-members`} aria-label={`查看全部 ${members.length} 位共同记录者`} onClick={toggleMembers}>
        <span className="collection-share-avatars">
          {members.slice(0, 3).map((member) => <span key={member.id} title={`${member.nickname || member.username} · ${member.id === collection.creator.id ? "创建者" : "共同成员"}`}><Avatar member={member} /></span>)}
          {members.length > 3 ? <span className="collection-share-overflow" aria-hidden="true">+{members.length - 3}</span> : null}
        </span>
        <span className="collection-share-count"><strong>{members.length}</strong> 位共同记录者</span>
        <span className="collection-share-tooltip" aria-hidden="true">{members.slice(0, 3).map((member) => `${member.nickname || member.username}（${member.id === collection.creator.id ? "创建者" : "共同成员"}）`).join("、")}{members.length > 3 ? "等" : ""}</span>
      </button>
      <button type="button" className="collection-share-action" onClick={copyLink} disabled={copying} aria-label="复制合集链接"><ShareIcon /><span>{copying ? "复制中" : "复制链接"}</span></button>
      {isCreator ? <button ref={inviteTrigger} type="button" className="collection-share-action collection-share-invite" aria-expanded={panel === "invite"} aria-controls={`${id}-invite`} onClick={openInvite}><ShareIcon invite /><span>{saving ? "正在添加" : "邀请成员"}</span></button> : null}
    </div>
    <div className="collection-share-feedback" role="status" aria-live="polite" aria-atomic="true">{feedback.text}</div>
    {feedback.error ? <label className="collection-share-manual-copy">合集地址<input aria-label="手动复制合集地址" readOnly value={canonicalUrl} onFocus={(event) => event.target.select()} /></label> : null}
    {saveError ? <p className="collection-share-error" role="alert">{saveError}</p> : null}

    {panel === "members" ? <section id={`${id}-members`} className="collection-share-panel" aria-labelledby={`${id}-members-title`}>
      <header><h2 ref={panelHeading} tabIndex={-1} id={`${id}-members-title`}>共同记录者 <small>{members.length} 位</small></h2><button type="button" onClick={closePanel} aria-label="关闭共同记录者名单">关闭</button></header>
      <ul className="collection-share-list">{members.map((member) => <li key={member.id}>
        <Link className="collection-share-person" to={`/users/${member.username}`}><Avatar member={member} /><span><strong>{member.nickname || member.username}</strong><small>@{member.username}</small></span><em>{member.id === collection.creator.id ? "创建者" : "共同成员"}</em></Link>
      </li>)}</ul>
    </section> : null}

    {panel === "invite" && isCreator ? <section id={`${id}-invite`} className="collection-share-panel" aria-labelledby={`${id}-invite-title`}>
      <header><h2 id={`${id}-invite-title`}>邀请共同记录者</h2><button type="button" onClick={closePanel} aria-label="关闭邀请面板">关闭</button></header>
      <p className="collection-share-note">将已有映墨用户加入合集，一起阅读和记录。</p>
      <form onSubmit={saveMembers} aria-busy={loading || saving}>
        <label className="collection-share-search" htmlFor={`${id}-search`}>查找用户<input ref={searchInput} id={`${id}-search`} type="search" value={query} placeholder="搜索昵称或用户名" autoComplete="off" disabled={saving} onChange={(event) => setQuery(event.target.value)} /></label>
        {loading ? <p className="collection-share-note" role="status">正在读取成员与可邀请用户…</p> : loadError ? <div className="collection-share-error" role="alert"><p>{loadError}</p><button type="button" onClick={loadInvite}>重新加载</button></div> : roster ? <>
          <button className="collection-share-joined" type="button" onClick={toggleMembers}>已加入 {currentMembers.length + 1} 位 · 查看成员名单</button>
          {unavailable.length ? <p className="collection-share-error" role="alert">{unavailable.map((member) => member.nickname || member.username).join("、")}目前不可用。为保留原有成员，请先到<Link to={`/collections/${collection.slug}/manage#collection-members`}>合集管理页面核对成员名单</Link>。</p> : null}
          <ul className="collection-share-list collection-share-options" aria-label="尚未加入的用户">{filtered.map((member) => <li key={member.id}>
            <label className="collection-share-person"><input type="checkbox" checked={selected.includes(member.id)} disabled={saving || Boolean(unavailable.length)} onChange={() => { setSaveError(""); setSelected((current) => current.includes(member.id) ? current.filter((value) => value !== member.id) : [...current, member.id]); }} /><Avatar member={member} /><span><strong>{member.nickname || member.username}</strong><small>@{member.username}</small></span></label>
          </li>)}</ul>
          {!filtered.length ? <p className="collection-share-note" role="status">{search && candidates.length ? "没有找到匹配的用户，试试其他昵称或用户名。" : "当前没有可邀请的用户；已有成员不会重复显示。"}</p> : null}
        </> : null}
        <footer><span aria-live="polite">已选择 {selected.length} 人</span><button type="button" onClick={() => { setSelected([]); closePanel(); }} disabled={saving}>取消</button><button className="collection-share-confirm" type="submit" disabled={saving || loading || Boolean(loadError) || !roster || Boolean(unavailable.length) || !selected.length}>{saving ? "正在添加…" : "确认添加"}</button></footer>
      </form>
    </section> : null}
  </div>;
}
