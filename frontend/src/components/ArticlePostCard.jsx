import { Link } from "react-router-dom";
import { excerpt, formatDate, postHref } from "../lib/format";
import { PostCardMedia } from "./PostCardMedia";

export function ArticlePostCard({ post, compact = false, variant = "", index = 0 }) {
  const media = post.cover_media || post.display_media;
  return (
    <article className={`post-card article-card ${compact ? "post-card-compact" : ""} ${media ? "post-card-with-cover" : ""} ${variant ? `post-card-${variant}` : ""}`} data-post-type="article">
      {variant ? <span className="post-card-entry-number tabular" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span> : null}
      <PostCardMedia post={post} media={media} compact={compact} label={`查看${post.title || "这篇文章"}的封面`} />
      <div className="post-card-content">
        <div className="post-card-meta">
          <span>文章</span>
          {post.reading_minutes ? <span>{post.reading_minutes} 分钟阅读</span> : null}
        </div>
        <h3><Link to={postHref(post)}>{post.title || "未命名文章"}</Link></h3>
        {excerpt(post) ? <p>{excerpt(post)}</p> : null}
        <div className="post-card-details">
          {post.author ? <Link to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : null}
          <span>发布：<time dateTime={post.published_at || undefined}>{formatDate(post.published_at)}</time></span>
          <span>更新：<time dateTime={post.updated_at || undefined}>{formatDate(post.updated_at)}</time></span>
        </div>
        <div className="post-card-context">
          {post.category ? <Link className="tag" to={`/categories/${post.category.slug}`}>{post.category.name}</Link> : null}
          {post.tags?.map((tag) => <Link className="tag" key={tag.id} to={`/tags/${tag.slug}`}>#{tag.name}</Link>)}
          {post.collection ? <Link className="tag collection-tag" to={`/collections/${post.collection.slug}`}>合集：{post.collection.name}</Link> : null}
        </div>
        {post.related_reasons?.length ? <p className="post-card-reasons" aria-label="关联原因">{post.related_reasons.join(" · ")}</p> : null}
      </div>
    </article>
  );
}
