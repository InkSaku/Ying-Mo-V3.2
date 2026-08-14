import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PublicHeader } from "../components/PublicHeader";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";

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
      <main className="auth-page">
        <form className="auth-card" onSubmit={submit}>
          <div>
            <p className="hero-kicker">成员入口</p>
            <h1>登录映墨</h1>
            <p>使用用户名或邮箱继续你的记录。</p>
          </div>
          {error ? <div className="inline-error" role="alert">{error}</div> : null}
          <label>
            <span>用户名或邮箱</span>
            <input required autoComplete="username" value={form.identifier}
              onChange={(event) => setForm({ ...form, identifier: event.target.value })} />
          </label>
          <label>
            <span>密码</span>
            <input required type="password" autoComplete="current-password" value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          <button className="btn btn-primary btn-wide" type="submit" disabled={busy}>
            {busy ? "登录中" : "登录"}
          </button>
          <p className="auth-foot">还没有账号？<Link to="/register">使用邀请码注册</Link></p>
        </form>
      </main>
    </>
  );
}
