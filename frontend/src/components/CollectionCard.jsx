import { startCollectionOpening } from "../lib/collectionOpening";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";

// 书架上的一册书：书壳、书页、书脊和封面。书架和介绍卡共用，翻开动效也认这套结构。
export function CollectionShelfBook({ collection, catalogueNumber }) {
  return <div className="collection-shelf-stage"><div className="collection-shelf-book">
    <span className="collection-shelf-back" aria-hidden="true" />
    <span className="collection-shelf-pages" aria-hidden="true" />
    <span className="collection-shelf-spine" aria-hidden="true" />
    <div className="collection-shelf-hinge"><div className="collection-card-cover-frame">
    <ProtectedImage
      media={collection.cover_media}
      useOriginal
      alt=""
      className="card-cover"
      fallback={<div className="collection-book-fallback" aria-hidden="true"><span></span><strong>{collection.name}</strong></div>}
    />
    <span className="collection-card-volume" aria-hidden="true">VOL. {catalogueNumber}</span>
    </div><span className="collection-shelf-lining" aria-hidden="true" /></div>
  </div></div>;
}

export function CollectionCard({ collection, variant = "", index = 0, onOpen }) {
  const catalogueNumber = String(index + 1).padStart(2, "0");
  const collectionPath = `/collections/${collection.slug}`;

  if (variant === "shelf") {
    const signerCount = collection.member_count;
    // 有介绍卡时，普通点按先把书抽出来看介绍；修改键、新标签仍按原生链接打开。
    const open = (event) => {
      if (!onOpen || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        startCollectionOpening(event, collection.slug);
        return;
      }
      event.preventDefault();
      onOpen(collection);
    };
    return (
      <article className="collection-card collection-card-shelf" data-flip-key={collection.id}>
        <Link className="collection-book-link" to={collectionPath} onClick={open} aria-haspopup={onOpen ? "dialog" : undefined} aria-label={onOpen ? `抽出合集看介绍：${collection.name}` : `打开合集：${collection.name}`}>
          <CollectionShelfBook collection={collection} catalogueNumber={catalogueNumber} />
        </Link>
        <div className="collection-card-content">
          <h3><Link to={collectionPath} onClick={open} aria-haspopup={onOpen ? "dialog" : undefined}>{collection.name}</Link></h3>
          {collection.description ? <p>{collection.description}</p> : <p className="muted"></p>}
          <div className="collection-book-meta">
            {collection.creator ? <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link> : <span>未知创建者</span>}
            <span aria-hidden="true">·</span>
            <span>{signerCount ? `${signerCount} 位合集成员` : "合集成员"}</span>
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
            fallback={<div className="collection-book-fallback" aria-hidden="true"><span></span><strong>{collection.name}</strong></div>}
          />
          <span className="collection-card-volume" aria-hidden="true">VOL. {catalogueNumber}</span>
        </div>
      ) : <ProtectedImage media={collection.cover_media} alt="" className="card-cover" />}
      <div className="collection-card-content">
      <div className="collection-card-top">
        <span>{variant === "featured" ? "精选合集" : "合集"}</span>
        <time dateTime={collection.updated_at || undefined}>{formatDate(collection.updated_at)}</time>
      </div>
      <h3><Link to={collectionPath} onClick={(event) => startCollectionOpening(event, collection.slug)}>{collection.name}</Link></h3>
      {collection.description ? <p>{collection.description}</p> : <p className="muted"></p>}
      <div className="collection-card-foot">
        <span>创建者</span>
        {collection.creator ? <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link> : null}
      </div>
      </div>
    </article>
  );
}
