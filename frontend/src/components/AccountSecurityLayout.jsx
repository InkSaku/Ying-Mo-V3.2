import { PublicHeader } from "./PublicHeader";

export function AccountSecurityLayout({ eyebrow, title, description, children, aside }) {
  return (
    <>
      <PublicHeader />
      <main className="auth-page account-security-page">
        <div className="account-security-layout">
          <section className="account-security-intro" aria-labelledby="account-security-title">
            <p className="hero-kicker">{eyebrow}</p>
            <h1 id="account-security-title">{title}</h1>
            <p>{description}</p>
            {aside ? <div className="account-security-aside">{aside}</div> : null}
          </section>
          <section className="auth-card account-security-card">{children}</section>
        </div>
      </main>
    </>
  );
}
