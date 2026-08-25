import { Link } from "react-router-dom";
import { excerpt, formatDate, postHref } from "../lib/format";
import { PostCardMedia } from "./PostCardMedia";

export function NotePostCard({ post, compact = false }) {
  const media = post.display_media || post.cover_media;
  const body = excerpt(post);
  return (
    <article className={`post-card note-card ${compact ? "post-card-compact" : ""} ${media ? "post-card-with-cover" : ""}`} data-post-type="note">
      <PostCardMedia post={post} media={media} compact={compact} label="查看这则随记的影像" />
      <div className="post-card-content">
        <div className="post-card-meta"><span>随记</span></div>
        <p className="note-card-text"><Link to={postHref(post)}>{body || "查看这则影像随记"}</Link></p>
        <div className="post-card-details">
          {post.author ? <Link to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : null}
          <span>发生：<time dateTime={post.semantic_time || undefined}>{formatDate(post.semantic_time)}</time></span>
          {post.location ? <span>地点：{post.location}</span> : null}
          {post.mood ? <span>心情：{post.mood}</span> : null}
        </div>
        <div className="post-card-context">
          {post.tags?.map((tag) => <Link className="tag" key={tag.id} to={`/tags/${tag.slug}`}>#{tag.name}</Link>)}
          {post.collection ? <Link className="tag collection-tag" to={`/collections/${post.collection.slug}`}>合集：{post.collection.name}</Link> : null}
        </div>
        {post.related_reasons?.length ? <p className="post-card-reasons" aria-label="关联原因">{post.related_reasons.join(" · ")}</p> : null}
      </div>
    </article>
  );
}
