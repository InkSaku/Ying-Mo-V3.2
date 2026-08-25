import { Link } from "react-router-dom";
import { postHref, postTypeLabel } from "../lib/format";
import { homeFeedExcerpt } from "../lib/homeFeed";
import { ProtectedImage } from "./ProtectedImage";

function memoryTitle(post) {
  if (post.post_type === "article") return post.title || "未命名文章";
  return homeFeedExcerpt(post, 96) || "一则影像随记";
}

export function FeedMemoryInterlude({ memory }) {
  if (!memory?.items?.length) return null;

  return (
    <aside className="home-feed-memory" aria-labelledby="home-feed-memory-title">
      <header className="home-feed-memory-header">
        <div>
          <p>{memory.month} 月 {memory.day} 日 · 往年今日</p>
          <h3 id="home-feed-memory-title">时间在这里折回来</h3>
        </div>
        <Link to="/on-this-day">查看全部{memory.total > memory.items.length ? ` ${memory.total}` : ""}</Link>
      </header>

      <div className="home-feed-memory-list">
        {memory.items.map((post) => {
          const media = post.display_media || post.cover_media;
          return (
            <Link className="home-feed-memory-item" to={postHref(post)} state={{ fromHomeFeed: true }} key={post.id}>
              <span className="home-feed-memory-year tabular">{post.memory_year}</span>
              <span className="home-feed-memory-copy">
                <span>{post.years_ago} 年前 · {postTypeLabel(post.post_type)} · {post.author?.nickname || post.author?.username}</span>
                <strong>{memoryTitle(post)}</strong>
              </span>
              {media ? <ProtectedImage media={media} alt="" className="home-feed-memory-image" /> : null}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
