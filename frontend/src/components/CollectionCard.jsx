import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";

export function CollectionCard({ collection }) {
  return (
    <article className="collection-card">
      <ProtectedImage media={collection.cover_media} alt="" className="card-cover" />
      <div className="collection-card-content">
      <div className="collection-card-top">
        <span>Collection</span>
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
