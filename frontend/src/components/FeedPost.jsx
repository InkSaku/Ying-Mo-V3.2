import { ArticleFeedPost } from "./ArticleFeedPost";
import { NoteFeedPost } from "./NoteFeedPost";

const FEED_POST_COMPONENTS = {
  article: ArticleFeedPost,
  note: NoteFeedPost,
};

export function FeedPost({ post }) {
  const Component = FEED_POST_COMPONENTS[post?.post_type];
  return Component ? <Component post={post} /> : null;
}
