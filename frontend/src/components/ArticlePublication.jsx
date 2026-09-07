import { Link } from "react-router-dom";
import { excerpt, formatDate, postHref } from "../lib/format";
import { PostCardMedia } from "./PostCardMedia";

function compactDate(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return match ? `${match[1]} / ${match[2]}` : "— / —";
}

function ArticleTypeLine({ post }) {
  return (
    <div className="articles-type-line">
      <span>文章</span>
      {post.reading_minutes ? <span>{post.reading_minutes} 分钟阅读</span> : null}
    </div>
  );
}

function ArticleCredits({ post, compact = false, showDate = true }) {
  return (
    <div className={`articles-credits ${compact ? "is-compact" : ""}`}>
      {post.author ? <Link to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : null}
      {showDate ? <span><time dateTime={post.published_at || undefined}>{formatDate(post.published_at)}</time></span> : null}
      {!compact && post.category ? <Link to={`/categories/${post.category.slug}`}>{post.category.name}</Link> : null}
    </div>
  );
}

export function ArticleLeadStory({ post, index }) {
  const media = post.cover_media || post.display_media;
  const summary = excerpt(post);
  return (
    <article className={`articles-lead-story ${media ? "has-media" : "without-media"}`} data-post-type="article">
      <span className="articles-entry-number tabular" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      {media ? <div className="articles-lead-visual"><PostCardMedia post={post} media={media} label={`查看${post.title || "本页首篇"}的封面`} /></div> : null}
      <div className="articles-lead-copy">
        <ArticleTypeLine post={post} />
        <h3><Link to={postHref(post)}>{post.title || "未命名文章"}</Link></h3>
        {summary ? <p>{summary}</p> : null}
        <ArticleCredits post={post} />
      </div>
    </article>
  );
}

export function ArticleMarginStory({ post, index }) {
  const summary = excerpt(post);
  return (
    <article className="articles-margin-story" data-post-type="article">
      <span className="articles-entry-number tabular" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div>
        <ArticleTypeLine post={post} />
        <h3><Link to={postHref(post)}>{post.title || "未命名文章"}</Link></h3>
        {summary ? <p>{summary}</p> : null}
        <ArticleCredits post={post} compact />
      </div>
    </article>
  );
}

export function ArticleIndexRow({ post }) {
  const summary = excerpt(post);
  return (
    <li>
      <article className="articles-index-row" data-post-type="article">
        <time className="articles-entry-date tabular" dateTime={post.published_at || undefined}>{compactDate(post.published_at)}</time>
        <div className="articles-index-copy">
          <ArticleTypeLine post={post} />
          <h3><Link to={postHref(post)}>{post.title || "未命名文章"}</Link></h3>
          {summary ? <p>{summary}</p> : null}
        </div>
        <div className="articles-index-meta"><ArticleCredits post={post} showDate={false} /><Link className="articles-index-arrow" to={postHref(post)} aria-label={`阅读${post.title || "未命名文章"}`}>→</Link></div>
      </article>
    </li>
  );
}
