import { PostCard } from "./PostCard";

export function MemoryCard({ post }) {
  return (
    <div className="memory-card">
      <div className="memory-card-marker" aria-label={`${post.years_ago} 年前`}>
        <span className="tabular">{post.memory_year}</span>
        <strong>{post.years_ago} 年前</strong>
      </div>
      <PostCard post={post} compact />
    </div>
  );
}
