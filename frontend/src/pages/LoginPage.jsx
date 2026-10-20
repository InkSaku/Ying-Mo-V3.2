import { InkBrandMark } from "../components/InkBrandMark";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LoginCompanion } from "../components/LoginCompanion";
import "../styles/login.css";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { prepareLoginPageTurn } from "../lib/loginPageTurn";
import { playPageTear } from "../lib/pageTear";

export function LoginPage() {
  usePageMeta("登录");
  const { login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState("");
  const [invalidCredentials, setInvalidCredentials] = useState(false);
  const passwordRef = useRef(null);
  const paperRef = useRef(null);
  const selectionRef = useRef(null);
  const pose = passwordVisible ? "covered" : busy ? "waiting" : error ? "error"
    : focusedField === "identifier" ? "curious" : focusedField === "password" ? "reading" : "welcome";

  useLayoutEffect(() => {
    const selection = selectionRef.current;
    const input = passwordRef.current;
    if (!selection || !input) return;
    if (selection.restoreFocus) input.focus({ preventScroll: true });
    if (selection.start !== null) input.setSelectionRange(selection.start, selection.end);
    selectionRef.current = null;
    // Chromium may restore its old selection after the type change (notably
    // after a screenshot or autofill). Reapply after that native restoration,
    // without stealing focus or undoing a subsequent keystroke.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === input && input.value === selection.value && selection.start !== null) {
        input.setSelectionRange(selection.start, selection.end);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [passwordVisible]);

  const togglePassword = () => {
    const input = passwordRef.current;
    selectionRef.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
      value: input.value,
      restoreFocus: document.activeElement === input,
    };
    setPasswordVisible((visible) => !visible);
  };

  const changeField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setInvalidCredentials(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setInvalidCredentials(false);
    const next = params.get("next");
    const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
    const isHome = destination.split(/[?#]/)[0] === "/home";
    const snapshot = prepareLoginPageTurn(paperRef.current);
    const submitBounds = event.nativeEvent.submitter?.getBoundingClientRect();
    const originX = submitBounds ? submitBounds.left + submitBounds.width / 2 : undefined;
    if (isHome) void import("./HomePage").catch(() => {});
    try {
      await login(form);
      void playPageTear(snapshot, () => {
        navigate(destination, { replace: true });
        if (isHome) window.scrollTo({ top: 0, behavior: "instant" });
      }, { originX });
    } catch (err) {
      setError(err.message);
      setInvalidCredentials(err.code === "INVALID_CREDENTIALS");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main ref={paperRef} className="login-paper">
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
              <LoginCompanion pose={pose} className="ink-entry-art" />
            </div>
            <figcaption></figcaption>
          </figure>
          <p className="login-handwritten" aria-hidden="true"><br /><span></span></p>
        </section>

        <section className="login-entry" aria-labelledby="login-title">
          <form className="login-form" onSubmit={submit} aria-busy={busy}>
            <header className="login-intro">
              <p className="login-overline"></p>
              <h1 id="login-title">好久不见。</h1>
              <p></p>
            </header>
            {error ? <div id="login-error" className="login-error" role="alert">{error}</div> : null}
            <label className="login-field" htmlFor="login-identifier">
              <span>用户名或邮箱</span>
              <input id="login-identifier" required autoComplete="username" readOnly={busy}
                aria-invalid={invalidCredentials || undefined} aria-describedby={error ? "login-error" : undefined}
                placeholder="输入用户名或邮箱" value={form.identifier}
                onFocus={() => setFocusedField("identifier")} onBlur={() => setFocusedField("")}
                onChange={(event) => changeField("identifier", event.target.value)} />
            </label>
            <div className="login-field">
              <div className="login-label-row">
                <label htmlFor="login-password">密码</label>
                <Link to="/forgot-password">忘记密码？</Link>
              </div>
              <div className="login-password-control">
                <input ref={passwordRef} id="login-password" required type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password" readOnly={busy} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                  aria-invalid={invalidCredentials || undefined} aria-describedby={error ? "login-error" : undefined}
                  placeholder="输入你的密码" value={form.password}
                  onFocus={() => setFocusedField("password")} onBlur={() => setFocusedField("")}
                  onChange={(event) => changeField("password", event.target.value)} />
                <button className="login-password-toggle" type="button" disabled={busy}
                  aria-label={passwordVisible ? "隐藏密码" : "显示密码"} aria-pressed={passwordVisible}
                  aria-controls="login-password" title={passwordVisible ? "隐藏密码" : "显示密码"}
                  onPointerDown={(event) => event.preventDefault()} onClick={togglePassword}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                    <circle cx="12" cy="12" r="2.8" />
                    {passwordVisible ? <path d="m4 4 16 16" /> : null}
                  </svg>
                </button>
              </div>
            </div>
            <button className="login-submit" type="submit" disabled={busy}>
              <span>{busy ? "正在登录…" : "登录"}</span><span aria-hidden="true">⟶</span>
            </button>
            <span className="sr-only" role="status">{busy ? "正在登录，请稍候。" : ""}</span>
            <p className="login-join">第一次来？ <Link to="/register">使用邀请码注册</Link></p>
          </form>
          <p className="login-postscript"><br /></p>
        </section>
      </div>
      <footer className="login-colophon"><span>映墨 · 留给生活的一页</span><span></span></footer>
    </main>
  );
}
