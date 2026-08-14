import { Link } from "react-router-dom";
import { excerpt, formatDate, postHref, postTypeLabel } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";

export function PostCard({ post, compact = false }) {
  return (
    <article className={`post-card ${compact ? "post-card-compact" : ""} ${post.cover_media ? "post-card-with-cover" : ""}`}>
      <ProtectedImage media={post.cover_media} alt="" className={`card-cover ${compact ? "card-cover-compact" : ""}`} />
      <div className="post-card-content">
      <div className="post-card-meta">
        <span>{postTypeLabel(post.post_type)}</span>
        <time dateTime={post.semantic_time || post.published_at || undefined}>
          {formatDate(post.semantic_time || post.published_at)}
        </time>
      </div>
      <h3>
        <Link to={postHref(post)}>
          {post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")}
        </Link>
      </h3>
      {excerpt(post) ? <p>{excerpt(post)}</p> : null}
      <div className="post-card-foot">
        {post.author ? <Link to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : <span />}
        {post.collection ? <Link to={`/collections/${post.collection.slug}`}>{post.collection.name}</Link> : null}
      </div>
      </div>
    </article>
  );
}
