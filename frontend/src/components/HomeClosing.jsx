import { Link } from "react-router-dom";
import { ProtectedImage } from "./ProtectedImage";
import { homeFeedExcerpt } from "../lib/homeFeed";
import { postHref } from "../lib/format";

export function HomeClosing({ memory, collections, collectionsReady }) {
  const post = memory?.items?.[0];
  return (
    <div className="home-closing">
      <section className="home-closing-memory" aria-labelledby="home-closing-memory-title">
        <header><h2 id="home-closing-memory-title">往年今日</h2>{post ? <span>{post.memory_year} · {memory.month}.{memory.day}</span> : <span>把今天，留给未来</span>}</header>
        {post ? <div className="home-closing-memory-body">
          {(post.display_media || post.cover_media) ? <Link to={postHref(post)}><ProtectedImage media={post.display_media || post.cover_media} alt="那一天的影像" /></Link> : null}
          <div><p>{homeFeedExcerpt(post, 80) || post.title || "那一天，也留下了一段记录。"}</p><Link to={postHref(post)}>翻开那一天 →</Link></div>
        </div> : <div className="home-closing-empty"><p>今天还没有往年的记录。<br />此刻写下的，也会成为日后的重逢。</p><Link to="/on-this-day">去看看往年今日 →</Link></div>}
      </section>
      <section className="home-closing-collections" aria-labelledby="home-closing-collections-title">
        <header><h2 id="home-closing-collections-title">共同记录</h2></header>
        {collections.length ? <div className="home-collection-index">{collections.slice(0, 2).map((collection) => <article key={collection.id}><h3><Link to={`/collections/${collection.slug}`}>{collection.name}<span aria-hidden="true"> →</span></Link></h3>{collection.description ? <p>{collection.description}</p> : null}</article>)}</div> : <p className="home-closing-empty">{collectionsReady ? "把共同走过的日子，收进同一册。" : "在合集里，接着写共同的故事。"}</p>}
        <Link to="/collections">查看合集 →</Link>
      </section>
    </div>
  );
}
