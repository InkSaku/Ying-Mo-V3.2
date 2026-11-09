import { ArticlePostCard } from "./ArticlePostCard";
import { NotePostCard } from "./NotePostCard";

const POST_CARD_COMPONENTS = {
  article: ArticlePostCard,
  note: NotePostCard,
};

// hideAuthor / hideCollection：列表已经处在某位作者或某个合集里时，不在每条记录上重复写同一个名字。
export function PostCard({ post, compact = false, variant = "", index = 0, hideAuthor = false, hideCollection = false, footer = null, cardProps }) {
  const Component = POST_CARD_COMPONENTS[post?.post_type];
  return Component ? <Component post={post} compact={compact} variant={variant} index={index} hideAuthor={hideAuthor} hideCollection={hideCollection} footer={footer} cardProps={cardProps} /> : null;
}
