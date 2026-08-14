import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { useAuth } from "../contexts/AuthContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { PersonalNav } from "../components/PersonalNav";

function deviceLabel(userAgent) {
  if (!userAgent) return "未知设备";
  const platform = /iPhone|iPad/i.test(userAgent)
    ? "iOS"
    : /Android/i.test(userAgent)
      ? "Android"
      : /Macintosh|Mac OS X/i.test(userAgent)
        ? "macOS"
        : /Windows/i.test(userAgent)
          ? "Windows"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "未知系统";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Firefox\//i.test(userAgent)
      ? "Firefox"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "浏览器";
  return `${platform} · ${browser}`;
}

export function SessionsPage() {
  usePageMeta("登录会话");
  const navigate = useNavigate();
  const { logoutAll, endLocalSession } = useAuth();
  const state = useAsyncData(() => api.get("/auth/sessions"), []);
  const [target, setTarget] = useState(null);
  const [showLogoutAll, setShowLogoutAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const sessions = useMemo(
    () => [...(state.data || [])].sort((left, right) => Number(right.current) - Number(left.current)),
    [state.data]
  );

  const revoke = async () => {
    if (!target) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await api.delete(`/auth/sessions/${target.id}`);
      setTarget(null);
      if (result.data.current) {
        endLocalSession();
        navigate("/login", { replace: true });
      } else {
        await state.reload();
      }
    } catch (error) {
      setActionError(error.message);
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    setActionError("");
    try {
      await logoutAll();
      navigate("/login", { replace: true });
    } catch (error) {
      setActionError(error.message);
      setShowLogoutAll(false);
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell narrow-page"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell sessions-page">
      <PersonalNav />
      <header className="page-heading">
        <div>
          <p className="hero-kicker">账户安全</p>
          <h1>登录会话</h1>
          <p>查看仍然有效的登录设备，结束不再使用或不认识的会话。</p>
        </div>
        {sessions.length ? <button className="btn btn-danger" type="button" onClick={() => setShowLogoutAll(true)}>退出所有设备</button> : null}
      </header>

      {actionError ? <div className="inline-error" role="alert">{actionError}</div> : null}

      {sessions.length ? (
        <section className="session-list" aria-label="有效登录会话">
          {sessions.map((session) => (
            <article className="session-card" key={session.id}>
              <div className="session-device">
                <div>
                  <h2>{deviceLabel(session.user_agent)}</h2>
                  {session.current ? <span className="session-current">当前设备</span> : null}
                </div>
                <p>{session.user_agent || "未记录浏览器信息"}</p>
              </div>
              <dl className="session-times">
                <div><dt>最近使用</dt><dd>{formatDate(session.last_used_at, true)}</dd></div>
                <div><dt>首次登录</dt><dd>{formatDate(session.created_at, true)}</dd></div>
                <div><dt>到期时间</dt><dd>{formatDate(session.expires_at, true)}</dd></div>
              </dl>
              <button className="btn btn-secondary" type="button" onClick={() => setTarget(session)}>
                {session.current ? "退出当前设备" : "结束会话"}
              </button>
            </article>
          ))}
        </section>
      ) : <EmptyState title="没有有效的登录会话" description="下次登录后，会话会显示在这里。" />}

      <ConfirmDialog
        open={Boolean(target)}
        title={target?.current ? "退出当前设备？" : "结束这个登录会话？"}
        description={target?.current
          ? "当前页面会立即退出，未保存的编辑内容可能丢失。"
          : `将结束 ${deviceLabel(target?.user_agent)} 的登录状态。`}
        confirmLabel={target?.current ? "确认退出" : "结束会话"}
        danger
        busy={busy}
        onConfirm={revoke}
        onClose={() => setTarget(null)}
      />
      <ConfirmDialog
        open={showLogoutAll}
        title="退出所有设备？"
        description="所有有效会话都会立即结束，包括当前设备。未保存的编辑内容可能丢失。"
        confirmLabel="全部退出"
        danger
        busy={busy}
        onConfirm={revokeAll}
        onClose={() => setShowLogoutAll(false)}
      />
    </main>
  );
}
