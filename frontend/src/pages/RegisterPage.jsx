import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import inkGardenPath from "../assets/auth/ink-garden-path.webp";
import "../styles/login.css";
import "../styles/register.css";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { fieldErrorsFrom } from "../lib/api";
import { needsEmailVerification } from "../lib/accountSecurity";

export function RegisterPage() {
  usePageMeta("注册");
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "", nickname: "", email: "", password: "", invite_code: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const user = await register(form);
      navigate(needsEmailVerification(user) ? "/verify-email?registered=1" : "/home", { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(fieldErrorsFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-paper register-paper">
      <header className="login-masthead">
        <Link to="/" className="login-wordmark" aria-label="映墨首页">映墨 <span>YING MO</span></Link>
        <span className="login-edition">文字与日常 · 从此开始</span>
      </header>
      <div className="login-spread register-spread">
        <section className="register-story" aria-label="为日常，留一页空白">
          <p className="register-chapter">第一章 / 相识</p>
          <h2>为日常，<br />留一页空白。</h2>
          <p className="register-story-note">一些念头，一点生活，<br />从你的第一行字开始。</p>
          <figure className="register-photo">
            <div className="register-art">
              <img src={inkGardenPath} alt="淡墨绘成的竹篱小径、初生枝叶与远处屋檐" />
            </div>
            <figcaption>循着小径，在新的一页落笔。</figcaption>
          </figure>
          <p className="register-handwritten" aria-hidden="true">Every story<br /><span>starts somewhere.</span></p>
          <p className="register-invitation">凭朋友的邀请，在这里落笔。</p>
        </section>
        <section className="register-entry" aria-labelledby="register-title">
          <form className="login-form register-form" onSubmit={submit}>
            <header className="login-intro">
              <p className="login-overline">一份邀请，一个新的开始</p>
              <h1 id="register-title">初次见面。</h1>
              <p>留下你的名字，我们从这里认识。</p>
            </header>

            {error ? <div className="login-error" role="alert">{error}</div> : null}

            <div className="register-fields">
              <label className="login-field">
                <span>用户名</span>
                <input required minLength={3} maxLength={32} autoComplete="username" placeholder="例如 icesakura" value={form.username} onChange={set("username")} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "username-error" : "username-help"} />
                <small id="username-help">3–32 位小写字母、数字、- 或 _，注册后不可修改。</small>
                {fieldErrors.username ? <small className="field-error" id="username-error">{fieldErrors.username}</small> : null}
              </label>

              <label className="login-field">
                <span>昵称</span>
                <input required maxLength={50} autoComplete="nickname" placeholder="希望朋友怎样称呼你" value={form.nickname} onChange={set("nickname")} aria-invalid={Boolean(fieldErrors.nickname)} aria-describedby={fieldErrors.nickname ? "nickname-error" : "nickname-help"} />
                <small id="nickname-help">朋友们看到的名字，之后也可以修改。</small>
                {fieldErrors.nickname ? <small className="field-error" id="nickname-error">{fieldErrors.nickname}</small> : null}
              </label>

              <label className="login-field">
                <span>邮箱</span>
                <input required type="email" autoComplete="email" placeholder="name@example.com" value={form.email} onChange={set("email")} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
                {fieldErrors.email ? <small className="field-error" id="email-error">{fieldErrors.email}</small> : null}
              </label>

              <label className="login-field">
                <span>密码</span>
                <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" placeholder="至少 8 个字符" value={form.password} onChange={set("password")} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
                {fieldErrors.password ? <small className="field-error" id="password-error">{fieldErrors.password}</small> : null}
              </label>
            </div>

            <label className="login-field">
              <span>邀请码</span>
              <input required autoComplete="off" placeholder="请输入朋友给你的邀请码" value={form.invite_code} onChange={set("invite_code")} aria-invalid={Boolean(fieldErrors.invite_code)} aria-describedby={fieldErrors.invite_code ? "invite-error" : undefined} />
              {fieldErrors.invite_code ? <small className="field-error" id="invite-error">{fieldErrors.invite_code}</small> : null}
            </label>

            <button className="login-submit" type="submit" disabled={busy}>
              <span>{busy ? "正在注册…" : "注册并发送验证邮件"}</span><span aria-hidden="true">⟶</span>
            </button>

            <p className="login-join">已经是成员？<Link to="/login">直接登录</Link></p>
          </form>
        </section>
      </div>
      <footer className="login-colophon"><span>映墨 · 留给生活的一页</span><span>THE FIRST OF MANY PAGES.</span></footer>
    </main>
  );
}
