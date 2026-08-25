import { Link } from "react-router-dom";
import { postHref } from "../lib/format";
import { homeFeedExcerpt } from "../lib/homeFeed";
import { FeedPostFrame, FeedPostMedia } from "./FeedPostFrame";

export function NoteFeedPost({ post }) {
  const href = postHref(post);
  const excerpt = homeFeedExcerpt(post, 420);
  const media = post.display_media || post.cover_media;

  return (
    <FeedPostFrame post={post}>
      {excerpt ? (
        <p className="home-feed-note-text"><Link to={href} state={{ fromHomeFeed: true }}>{excerpt}</Link></p>
      ) : (
        <p className="home-feed-note-text"><Link to={href} state={{ fromHomeFeed: true }}>查看这则影像随记</Link></p>
      )}
      <FeedPostMedia post={post} media={media} label="查看这则随记的影像" />
    </FeedPostFrame>
  );
}
