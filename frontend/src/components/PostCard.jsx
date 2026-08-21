import { Link } from "react-router-dom";
import { excerpt, formatDate, postHref, postTypeLabel } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";

export function PostCard({ post, compact = false }) {
  const isArticle = post.post_type === "article";
  const media = post.display_media || post.cover_media;
  return (
    <article className={`post-card ${compact ? "post-card-compact" : ""} ${media ? "post-card-with-cover" : ""} ${isArticle ? "article-card" : "note-card"}`}>
      <ProtectedImage media={media} alt="" className={`card-cover ${compact ? "card-cover-compact" : ""}`} />
      <div className="post-card-content">
      <div className="post-card-meta">
        <span>{postTypeLabel(post.post_type)}</span>
        {isArticle && post.reading_minutes ? <span>{post.reading_minutes} 分钟阅读</span> : null}
      </div>
      <h3>
        <Link to={postHref(post)}>
          {post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")}
        </Link>
      </h3>
      {excerpt(post) ? <p>{excerpt(post)}</p> : null}
      <div className="post-card-details">
        {post.author ? <Link to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : null}
        {isArticle ? (
          <>
            <span>发布：<time dateTime={post.published_at || undefined}>{formatDate(post.published_at)}</time></span>
            <span>更新：<time dateTime={post.updated_at || undefined}>{formatDate(post.updated_at)}</time></span>
          </>
        ) : (
          <>
            <span>发生：<time dateTime={post.semantic_time || undefined}>{formatDate(post.semantic_time)}</time></span>
            {post.location ? <span>地点：{post.location}</span> : null}
            {post.mood ? <span>心情：{post.mood}</span> : null}
          </>
        )}
      </div>
      <div className="post-card-context">
        {isArticle && post.category ? <Link className="tag" to={`/categories/${post.category.slug}`}>{post.category.name}</Link> : null}
        {post.tags?.map((tag) => <Link className="tag" key={tag.id} to={`/tags/${tag.slug}`}>#{tag.name}</Link>)}
        {post.collection ? <Link className="tag collection-tag" to={`/collections/${post.collection.slug}`}>合集：{post.collection.name}</Link> : null}
      </div>
      {post.related_reasons?.length ? (
        <p className="post-card-reasons" aria-label="关联原因">
          {post.related_reasons.join(" · ")}
        </p>
      ) : null}
      </div>
    </article>
  );
}
