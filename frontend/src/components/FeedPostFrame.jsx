import { Link } from "react-router-dom";
import { formatDate, postHref, postTypeLabel } from "../lib/format";
import { logicalMediaFromPostDisplay } from "../lib/mediaGallery";
import { MediaOpenButton } from "./MediaOpenButton";
import { ProtectedImage } from "./ProtectedImage";

export function FeedPostMedia({ post, media, label }) {
  if (!media) return null;
  return (
    <MediaOpenButton item={logicalMediaFromPostDisplay(post)} context="home-feed" label={label}>
      <ProtectedImage media={media} alt="" className="home-feed-media" />
    </MediaOpenButton>
  );
}

export function FeedPostFrame({ post, actionLabel = "查看与回应", children }) {
  const href = postHref(post);
  const initial = (post.author?.nickname || post.author?.username || "?").slice(0, 1);
  const semanticTime = post.semantic_time || post.published_at;
  const context = post.collection
    ? <Link to={`/collections/${post.collection.slug}`}>Collection · {post.collection.name}</Link>
    : post.location ? <span>{post.location}</span> : null;

  return (
    <article className={`home-feed-post is-${post.post_type} ${post._feedFresh ? "is-fresh" : ""}`} data-post-type={post.post_type}>
      <header className="home-feed-post-header">
        <Link className="home-feed-avatar-link" to={`/users/${post.author?.username}`} aria-label={`查看${post.author?.nickname || "作者"}的主页`}>
          <ProtectedImage media={post.author?.avatar_media} alt="" className="home-feed-avatar" fallback={<span className="home-feed-avatar-fallback" aria-hidden="true">{initial}</span>} />
        </Link>
        <div>
          <Link className="home-feed-author" to={`/users/${post.author?.username}`}>{post.author?.nickname || post.author?.username}</Link>
          <p><span>{postTypeLabel(post.post_type)}</span><time dateTime={semanticTime || undefined}>{formatDate(semanticTime, true)}</time></p>
        </div>
        {post._feedFresh ? <span className="home-feed-fresh-label">刚刚发布</span> : null}
      </header>

      <div className="home-feed-post-body">{children}</div>

      <footer className="home-feed-post-footer">
        <div>{context}</div>
        <Link to={href} state={{ fromHomeFeed: true }}>{actionLabel}</Link>
      </footer>
    </article>
  );
}
