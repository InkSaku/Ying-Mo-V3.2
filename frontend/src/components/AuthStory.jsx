const ICON_PATHS = {
  lock: (
    <>
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M12 14.5v2" />
    </>
  ),
  pen: (
    <>
      <path d="m4 20 4.2-1 9.4-9.4a2.3 2.3 0 0 0-3.2-3.2L5 15.8 4 20Z" />
      <path d="m13.5 7.5 3 3M9 20h11" />
    </>
  ),
  archive: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2.5" />
      <path d="M8 6V4.5h8V6M9 11h6" />
      <circle cx="12" cy="15.5" r="1.5" />
    </>
  ),
};

function StoryIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[name] || ICON_PATHS.pen}
      </g>
    </svg>
  );
}

export function AuthStory({ step, eyebrow, title, description, quote, features }) {
  return (
    <section className="auth-story" aria-labelledby={`auth-story-${step}`}>
      <p className="auth-story-step tabular">{step}</p>
      <p className="auth-story-eyebrow">{eyebrow}</p>
      <h2 className="auth-story-title" id={`auth-story-${step}`}>{title}</h2>
      <p className="auth-story-description">{description}</p>

      <blockquote className="auth-story-quote">{quote}</blockquote>

      <div className="auth-story-features" aria-label="映墨特点">
        {features.map((feature) => (
          <article className="auth-story-feature" key={feature.title}>
            <span className="auth-story-icon"><StoryIcon name={feature.icon} /></span>
            <div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
