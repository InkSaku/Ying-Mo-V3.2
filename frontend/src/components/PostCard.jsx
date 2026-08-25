import { ArticlePostCard } from "./ArticlePostCard";
import { NotePostCard } from "./NotePostCard";

const POST_CARD_COMPONENTS = {
  article: ArticlePostCard,
  note: NotePostCard,
};

export function PostCard({ post, compact = false }) {
  const Component = POST_CARD_COMPONENTS[post?.post_type];
  return Component ? <Component post={post} compact={compact} /> : null;
}
