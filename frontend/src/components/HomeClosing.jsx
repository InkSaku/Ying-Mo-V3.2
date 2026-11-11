import { Link } from "react-router-dom";
import { ProtectedImage } from "./ProtectedImage";
import { InkSketch } from "./InkSketch";
import { homeFeedExcerpt } from "../lib/homeFeed";
import { postHref } from "../lib/format";

function CollectionIndex({ collections }) {
  return <div className="home-collection-index">{collections.slice(0, 2).map((collection) => <article key={collection.id}><h3><Link to={`/collections/${collection.slug}`}>{collection.name}<span aria-hidden="true"> →</span></Link></h3>{collection.description ? <p>{collection.description}</p> : null}</article>)}</div>;
}

export function HomeClosing({ memory, collections, collectionsReady }) {
  const post = memory?.items?.[0];
  return (
    <div className="home-closing">
      <section className="home-closing-memory" aria-labelledby="home-closing-memory-title">
        <header><h2 id="home-closing-memory-title">往年今日</h2>{post ? <span>{post.memory_year} · {memory.month}.{memory.day}</span> : <span>往年今日</span>}</header>
        {post ? <div className="home-closing-memory-body">
          {(post.display_media || post.cover_media) ? <Link to={postHref(post)}><ProtectedImage media={post.display_media || post.cover_media} alt="那一天的影像" /></Link> : null}
          <div><p>{homeFeedExcerpt(post, 80) || post.title || "那一天，也留下了一段记录。"}</p><Link to={postHref(post)}>查看记录 →</Link></div>
        </div> : <div className="home-closing-empty"><p>暂无可查看的往年今日记录。<br /></p><Link to="/on-this-day">查看往年今日 →</Link></div>}
      </section>
      <section className="home-closing-collections" aria-labelledby="home-closing-collections-title">
        <header><h2 id="home-closing-collections-title">共同记录</h2></header>
        {collections.length ? <CollectionIndex collections={collections} /> : <p className="home-closing-empty">{collectionsReady ? "你创建或加入的合集。" : ""}</p>}
        <Link to="/collections">查看合集 →</Link>
      </section>
    </div>
  );
}

/* 手机侧栏排在无限加载的时间流之后，几乎翻不到；“共同记录”改为夹在时间流里的一页插页。桌面仍用侧栏，这里由样式隐藏。 */
export function HomeCollectionsInterlude({ collections }) {
  if (!collections?.length) return null;
  return (
    <section className="home-feed-collections" aria-labelledby="home-feed-collections-title">
      <InkSketch variant="volumes" className="home-feed-collections-art" />
      <h2 id="home-feed-collections-title">共同记录<span> · 你参与的合集</span></h2>
      <div className="home-feed-collections-body">
        <CollectionIndex collections={collections} />
        <Link to="/collections">查看合集 →</Link>
      </div>
    </section>
  );
}
