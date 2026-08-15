import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { PersonalNav } from "../components/PersonalNav";
import { ErrorState, PageLoader } from "../components/States";
import { AvatarManager } from "../components/AvatarManager";
import { accountActionMessage, emailVerificationState } from "../lib/accountSecurity";
import { formatDate } from "../lib/format";

export function SettingsPage() {
  usePageMeta("个人资料");
  const { user, refreshMe } = useAuth();
  const [form, setForm] = useState({ nickname: "", bio: "", region: "" });
  const [profile, setProfile] = useState({
    avatar_media_id: null,
    avatar_media: null,
    nickname: "",
    username: "",
    email: "",
    email_verified: false,
    email_verified_at: null,
  });
  const [loadState, setLoadState] = useState({ loading: true, loaded: false, error: null });
  const [action, setAction] = useState({ busy: false, message: "", error: "" });
  const [verificationAction, setVerificationAction] = useState({ busy: false, message: "", error: "" });

  const load = useCallback(async () => {
    setLoadState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await api.get("/users/me/settings");
      setForm({
        nickname: result.data.nickname || "",
        bio: result.data.bio || "",
        region: result.data.region || "",
      });
      setProfile(result.data);
      setLoadState({ loading: false, loaded: true, error: null });
    } catch (error) {
      setLoadState((current) => ({ ...current, loading: false, error }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.nickname.trim()) {
      setAction({ busy: false, message: "", error: "昵称不能为空。" });
      return;
    }
    setAction({ busy: true, message: "", error: "" });
    try {
      const updated = await api.patch("/users/me", {
        nickname: form.nickname.trim(),
        bio: form.bio.trim() || null,
        region: form.region.trim() || null,
      });
      setProfile(updated.data);
      await refreshMe();
      setAction({ busy: false, message: "公开资料已保存。", error: "" });
    } catch (error) {
      setAction({ busy: false, message: "", error: error.message });
    }
  };

  const resendVerification = async () => {
    setVerificationAction({ busy: true, message: "", error: "" });
    try {
      const result = await api.post("/auth/email-verification/request", {});
      setVerificationAction({
        busy: false,
        message: accountActionMessage(result.data, "验证邮件已发送。请检查收件箱和垃圾邮件。"),
        error: "",
      });
    } catch (error) {
      setVerificationAction({ busy: false, message: "", error: error.message });
    }
  };

  if (loadState.loading && !loadState.loaded) return <PageLoader label="正在读取个人资料" />;
  if (loadState.error && !loadState.loaded) {
    return <main className="page-shell narrow-page"><ErrorState error={loadState.error} onRetry={load} /></main>;
  }

  return (
    <main className="page-shell settings-page">
      <PersonalNav />
      <header className="page-heading">
        <div><h1>个人资料</h1><p>这里编辑其他成员能看到的资料；用户名、角色与账户状态不能在此修改。</p></div>
      </header>
      <AvatarManager profile={profile} onChange={async (updated) => {
        setProfile(updated);
        try {
          await refreshMe();
        } catch {
          // 头像接口已经保存成功；顶部账户信息可在下一次请求时同步。
        }
      }} />
      <form className="editor-form settings-form" onSubmit={submit} aria-busy={action.busy || undefined}>
        {action.error ? <div className="inline-error" role="alert">{action.error}</div> : null}
        {action.message ? <div className="inline-success" role="status">{action.message}</div> : null}
        <label>
          <span>昵称</span>
          <input required maxLength={50} value={form.nickname} onChange={(event) => {
            setForm({ ...form, nickname: event.target.value });
            setAction((current) => ({ ...current, message: "", error: "" }));
          }} />
          <small>{form.nickname.length} / 50</small>
        </label>
        <label>
          <span>简介</span>
          <textarea maxLength={500} rows={7} value={form.bio} onChange={(event) => {
            setForm({ ...form, bio: event.target.value });
            setAction((current) => ({ ...current, message: "", error: "" }));
          }} />
          <small>{form.bio.length} / 500</small>
        </label>
        <label>
          <span>地区</span>
          <input maxLength={100} value={form.region} onChange={(event) => {
            setForm({ ...form, region: event.target.value });
            setAction((current) => ({ ...current, message: "", error: "" }));
          }} />
          <small>{form.region.length} / 100</small>
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={action.busy || loadState.loading}>
            {action.busy ? "保存中" : "保存资料"}
          </button>
        </div>
      </form>
      <section className="settings-security-section" aria-labelledby="settings-email-title">
        <header>
          <div>
            <p className="section-kicker">账户安全</p>
            <h2 id="settings-email-title">邮箱验证</h2>
          </div>
          <span className={`verification-badge is-${emailVerificationState(profile)}`}>
            {emailVerificationState(profile) === "verified" ? "已验证" : "待验证"}
          </span>
        </header>
        <p>验证邮箱用于安全找回密码。邮箱地址不能在个人资料页直接修改。</p>
        <dl className="settings-security-details">
          <div><dt>账户邮箱</dt><dd>{profile.email || user?.email || "未记录"}</dd></div>
          <div>
            <dt>验证时间</dt>
            <dd>{profile.email_verified_at ? formatDate(profile.email_verified_at, true) : "尚未验证"}</dd>
          </div>
        </dl>
        {verificationAction.error ? <div className="inline-error" role="alert">{verificationAction.error}</div> : null}
        {verificationAction.message ? <div className="inline-success" role="status">{verificationAction.message}</div> : null}
        <div className="settings-security-actions" aria-busy={verificationAction.busy || undefined}>
          {emailVerificationState(profile) !== "verified" ? (
            <button className="btn btn-primary" type="button" disabled={verificationAction.busy} onClick={resendVerification}>
              {verificationAction.busy ? "正在发送验证邮件" : verificationAction.message ? "再次发送验证邮件" : "发送验证邮件"}
            </button>
          ) : null}
          <Link className="btn btn-secondary" to="/verify-email">查看验证状态</Link>
        </div>
      </section>
    </main>
  );
}
