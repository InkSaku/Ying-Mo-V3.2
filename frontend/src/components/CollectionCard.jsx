import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";

export function CollectionCard({ collection, variant = "", index = 0 }) {
  const catalogueNumber = String(index + 1).padStart(2, "0");
  return (
    <article className={`collection-card ${variant ? `collection-card-${variant}` : ""}`}>
      {variant ? (
        <div className="collection-card-cover-frame">
          <ProtectedImage media={collection.cover_media} alt="" className="card-cover" />
          <span className="collection-card-volume" aria-hidden="true">VOL. {catalogueNumber}</span>
        </div>
      ) : <ProtectedImage media={collection.cover_media} alt="" className="card-cover" />}
      <div className="collection-card-content">
      <div className="collection-card-top">
        <span>{variant === "featured" ? "Featured Collection" : "Collection"}</span>
        <time dateTime={collection.updated_at || undefined}>{formatDate(collection.updated_at)}</time>
      </div>
      <h3><Link to={`/collections/${collection.slug}`}>{collection.name}</Link></h3>
      {collection.description ? <p>{collection.description}</p> : <p className="muted">还没有填写合集说明。</p>}
      <div className="collection-card-foot">
        <span>创建者</span>
        {collection.creator ? <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link> : null}
      </div>
      </div>
    </article>
  );
}
