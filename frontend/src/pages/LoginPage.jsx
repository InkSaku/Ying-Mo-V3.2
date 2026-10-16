import { InkBrandMark } from "../components/InkBrandMark";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { InkSketch } from "../components/InkSketch";
import "../styles/login.css";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { HOME_SPARK_WELCOME_KEY } from "../lib/homeSparkWelcome";

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
      const next = params.get("next");
      const destination = next && next.startsWith("/") ? next : "/home";
      if (destination === "/home") window.sessionStorage.setItem(HOME_SPARK_WELCOME_KEY, "1");
      await login(form);
      if (destination !== "/home") window.sessionStorage.removeItem(HOME_SPARK_WELCOME_KEY);
      navigate(destination, { replace: true });
    } catch (err) {
      window.sessionStorage.removeItem(HOME_SPARK_WELCOME_KEY);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-paper">
      <header className="login-masthead">
        <Link to="/" className="login-wordmark" aria-label="映墨首页"><InkBrandMark />映墨 <span>YING MO</span></Link>
        <span className="login-edition">文字与日常 · 私人留存</span>
      </header>

      <div className="login-spread">
        <section className="login-story" aria-label="记录生活，也保留此刻的自己">
          <div className="login-story-copy">
            <p className="login-ink" aria-hidden="true">墨</p>
            <p className="login-manifesto">记录生活，<br />也保留此刻的自己。</p>
            <p className="login-english"><br /></p>
          </div>
          <figure className="login-landscape">
            <div className="login-landscape-art">
              <InkSketch variant="reader" className="ink-entry-art" />
            </div>
            <figcaption></figcaption>
          </figure>
          <p className="login-handwritten" aria-hidden="true"><br /><span></span></p>
        </section>

        <section className="login-entry" aria-labelledby="login-title">
          <form className="login-form" onSubmit={submit}>
            <header className="login-intro">
              <p className="login-overline"></p>
              <h1 id="login-title">好久不见。</h1>
              <p></p>
            </header>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <label className="login-field" htmlFor="login-identifier">
              <span>用户名或邮箱</span>
              <input id="login-identifier" required autoComplete="username"
                placeholder="输入用户名或邮箱" value={form.identifier}
                onChange={(event) => setForm({ ...form, identifier: event.target.value })} />
            </label>
            <div className="login-field">
              <div className="login-label-row">
                <label htmlFor="login-password">密码</label>
                <Link to="/forgot-password">忘记密码？</Link>
              </div>
              <input id="login-password" required type="password" autoComplete="current-password"
                placeholder="输入你的密码" value={form.password}
                onChange={(event) => { setForm({ ...form, password: event.target.value }); setError(""); }} />
            </div>
            <button className="login-submit" type="submit" disabled={busy}>
              <span>{busy ? "正在登录…" : "登录"}</span><span aria-hidden="true">⟶</span>
            </button>
            <p className="login-join">第一次来？ <Link to="/register">使用邀请码注册</Link></p>
          </form>
          <p className="login-postscript"><br /></p>
        </section>
      </div>
      <footer className="login-colophon"><span>映墨 · 留给生活的一页</span><span></span></footer>
    </main>
  );
}
