import { Link } from "react-router-dom";
import { excerpt, formatDate, postHref, postTypeLabel } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";

export function NoteExperience({ experience }) {
  if (!experience?.collection) return null;
  const { collection, items = [] } = experience;

  return (
    <section className="note-experience" aria-labelledby="note-experience-title">
      <header className="note-experience-heading">
        <h2 id="note-experience-title">同一段共同经历</h2>
        <p>这条随记收在 <Link to={`/collections/${collection.slug}`}>{collection.name}</Link> 中。</p>
      </header>

      {collection.description ? <p className="note-experience-description">{collection.description}</p> : null}

      {items.length ? (
        <div className="note-experience-trail">
          {items.map((item) => {
            const media = item.display_media || item.cover_media;
            const href = postHref(item);
            return (
              <article className={`note-experience-item ${media ? "has-media" : ""}`} key={item.id}>
                {media ? <Link className="note-experience-media-link" to={href} aria-label={`查看${item.title || "这则记录"}`}><ProtectedImage media={media} alt="" className="note-experience-media" /></Link> : null}
                <div className="note-experience-copy">
                  <p className="note-experience-meta">
                    <span>{item.experience_position === "before" ? "此前" : "后来"}</span>
                    <span>{postTypeLabel(item.post_type)}</span>
                    {item.author ? <Link to={`/users/${item.author.username}`}>{item.author.nickname}</Link> : null}
                    <time dateTime={item.semantic_time || undefined}>{formatDate(item.semantic_time, true)}</time>
                  </p>
                  {item.post_type === "article" ? <h3><Link to={href}>{item.title || "未命名文章"}</Link></h3> : <p className="note-experience-note"><Link to={href}>{excerpt(item) || "查看这则影像随记"}</Link></p>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className="note-experience-empty">这段经历暂时只有这一条记录，可以从 Collection 继续补充。</p>}

      <p className="note-experience-collection-link"><Link to={`/collections/${collection.slug}`}>查看完整 Collection</Link></p>
    </section>
  );
}
