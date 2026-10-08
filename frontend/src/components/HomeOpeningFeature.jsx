import { Link } from "react-router-dom";
import { HOME_FEED_SAVE_EVENT, homeFeedExcerpt } from "../lib/homeFeed";
import { formatDate, postHref, postTypeLabel } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";
import { HomeInkLandscape } from "./HomeSketches";

export function HomeOpeningFeature({ post, loading = false }) {
  const media = post?.post_type === "article"
    ? post.cover_media || post.display_media
    : post?.display_media || post?.cover_media;
  const title = post?.post_type === "article"
    ? post.title || "未命名文章"
    : homeFeedExcerpt(post, 48) || "一则影像随记";
  const summary = post?.post_type === "article" ? homeFeedExcerpt(post, 64) : null;
  const href = post ? postHref(post) : null;
  const author = post?.author?.nickname || post?.author?.username || "朋友";
  const rememberDeparture = () => window.dispatchEvent(new Event(HOME_FEED_SAVE_EVENT));

  return <article className={`home-opening-feature${media ? " has-image" : " is-illustrated"}`} aria-busy={loading || undefined}>
    <div className="home-opening-feature-visual">
      {media ? <Link to={href} state={{ fromHomeFeed: true }} onClick={rememberDeparture} aria-label={`阅读${author}的${postTypeLabel(post.post_type)}：${title}`}>
        <ProtectedImage media={media} useOriginal alt="" className="home-opening-feature-image" fallback={<HomeInkLandscape />} />
      </Link> : <HomeInkLandscape />}
    </div>
    {post ? <>
      <div className="home-opening-feature-meta"><span>01 / 从这一页读起</span><span>{author} · {postTypeLabel(post.post_type)}</span></div>
      <h2><Link to={href} state={{ fromHomeFeed: true }} onClick={rememberDeparture}>{title}</Link></h2>
      <div className="home-opening-feature-footer">
        <span>{summary || formatDate(post.semantic_time || post.published_at)}</span>
        <Link to={href} state={{ fromHomeFeed: true }} onClick={rememberDeparture}>走进这则记录 ↗</Link>
      </div>
    </> : <>
      <div className="home-opening-feature-meta"><span>01 / 从这一页读起</span><span>映墨 · 日常来信</span></div>
      <h2>{loading ? "正在接上朋友们的近况" : "下一则值得读的故事，从这里开始。"}</h2>
      <div className="home-opening-feature-footer"><span>{loading ? "请稍等片刻。" : "现在写下的，也会成为未来的一页。"}</span></div>
    </>}
  </article>;
}
