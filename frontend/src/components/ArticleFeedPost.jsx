import { Link } from "react-router-dom";
import { postHref } from "../lib/format";
import { homeFeedExcerpt } from "../lib/homeFeed";
import { FeedPostFrame, FeedPostMedia } from "./FeedPostFrame";

export function ArticleFeedPost({ post }) {
  const href = postHref(post);
  const excerpt = homeFeedExcerpt(post, 220);
  const media = post.cover_media || post.display_media;

  return (
    <FeedPostFrame post={post} actionLabel="阅读全文与回应">
      <div className="home-feed-article-copy">
        <h2><Link to={href} state={{ fromHomeFeed: true }}>{post.title || "未命名文章"}</Link></h2>
        {excerpt ? <p className="home-feed-article-excerpt">{excerpt}</p> : null}
        {post.reading_minutes ? <p className="home-feed-article-reading">约 {post.reading_minutes} 分钟阅读</p> : null}
      </div>
      <FeedPostMedia post={post} media={media} label={`查看${post.title || "这篇文章"}的封面`} />
    </FeedPostFrame>
  );
}
