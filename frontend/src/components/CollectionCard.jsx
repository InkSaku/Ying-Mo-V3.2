import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";

export function CollectionCard({ collection, variant = "", index = 0 }) {
  const catalogueNumber = String(index + 1).padStart(2, "0");
  const collectionPath = `/collections/${collection.slug}`;

  if (variant === "shelf") {
    const signerCount = collection.member_count;
    return (
      <article className="collection-card collection-card-shelf">
        <Link className="collection-book-link" to={collectionPath} aria-label={`打开合集：${collection.name}`}>
          <div className="collection-card-cover-frame">
            <ProtectedImage
              media={collection.cover_media}
              useOriginal
              alt=""
              className="card-cover"
              fallback={<div className="collection-book-fallback" aria-hidden="true"><span>COLLECTION</span><strong>{collection.name}</strong></div>}
            />
            <span className="collection-card-volume" aria-hidden="true">VOL. {catalogueNumber}</span>
          </div>
        </Link>
        <div className="collection-card-content">
          <h3><Link to={collectionPath}>{collection.name}</Link></h3>
          {collection.description ? <p>{collection.description}</p> : <p className="muted">这一册还没有写下卷首说明。</p>}
          <div className="collection-book-meta">
            {collection.creator ? <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link> : <span>未知创建者</span>}
            <span aria-hidden="true">·</span>
            <span>{signerCount ? `${signerCount} 人共同署名` : "共同维护"}</span>
          </div>
          <time dateTime={collection.updated_at || undefined}>{formatDate(collection.updated_at)}</time>
        </div>
      </article>
    );
  }

  return (
    <article className={`collection-card ${variant ? `collection-card-${variant}` : ""}`}>
      {variant ? (
        <div className="collection-card-cover-frame">
          <ProtectedImage
            media={collection.cover_media}
            alt=""
            className="card-cover"
            fallback={<div className="collection-book-fallback" aria-hidden="true"><span>COLLECTION</span><strong>{collection.name}</strong></div>}
          />
          <span className="collection-card-volume" aria-hidden="true">VOL. {catalogueNumber}</span>
        </div>
      ) : <ProtectedImage media={collection.cover_media} alt="" className="card-cover" />}
      <div className="collection-card-content">
      <div className="collection-card-top">
        <span>{variant === "featured" ? "Featured Collection" : "Collection"}</span>
        <time dateTime={collection.updated_at || undefined}>{formatDate(collection.updated_at)}</time>
      </div>
      <h3><Link to={collectionPath}>{collection.name}</Link></h3>
      {collection.description ? <p>{collection.description}</p> : <p className="muted">还没有填写合集说明。</p>}
      <div className="collection-card-foot">
        <span>创建者</span>
        {collection.creator ? <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link> : null}
      </div>
      </div>
    </article>
  );
}
