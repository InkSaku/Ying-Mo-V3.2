import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthStory } from "../components/AuthStory";
import { PublicHeader } from "../components/PublicHeader";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";

const LOGIN_FEATURES = [
  { icon: "lock", title: "私密邀请制", description: "仅限受邀成员加入" },
  { icon: "pen", title: "持续记录", description: "每日书写，持续沉淀" },
  { icon: "archive", title: "有序归档", description: "让回忆清晰可循" },
];

export function LoginPage() {
  usePageMeta("登录");
  const { login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form);
      const next = params.get("next");
      navigate(next && next.startsWith("/") ? next : "/home", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PublicHeader />
      <main className="auth-page auth-editorial-page">
        <div className="auth-editorial-layout">
          <AuthStory
            step="01"
            eyebrow="成员入口"
            title="继续书写你的映墨"
            description="映墨是为朋友们准备的私密书写空间，在这里，文字被认真对待，记忆被妥帖安放，思想得以缓慢生长。"
            quote="像在好纸上写字那样，慢一点，也更认真。"
            features={LOGIN_FEATURES}
          />

          <form className="auth-card auth-editorial-card" onSubmit={submit}>
            <header className="auth-card-intro">
              <p className="auth-badge">Member Entry</p>
              <h1>登录映墨</h1>
              <p>使用用户名或邮箱继续你的记录。</p>
            </header>

            {error ? <div className="inline-error" role="alert">{error}</div> : null}

            <label className="auth-field">
              <span>用户名或邮箱</span>
              <input
                required
                autoComplete="username"
                placeholder="请输入用户名或邮箱"
                value={form.identifier}
                onChange={(event) => setForm({ ...form, identifier: event.target.value })}
              />
            </label>

            <div className="auth-field">
              <div className="auth-label-row">
                <label htmlFor="login-password">密码</label>
                <Link to="/forgot-password">忘记密码？</Link>
              </div>
              <input
                id="login-password"
                required
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                value={form.password}
                onChange={(event) => {
                  setForm({ ...form, password: event.target.value });
                  setError("");
                }}
              />
            </div>

            <button className="btn btn-primary btn-wide auth-primary-action" type="submit" disabled={busy}>
              {busy ? "登录中" : "登录"}
            </button>

            <Link className="btn btn-wide auth-outline-action" to="/register">
              使用邀请码注册
            </Link>

            <p className="auth-foot">还没有账号？<Link to="/register">使用邀请码加入映墨。</Link></p>
          </form>
        </div>
      </main>
    </>
  );
}
