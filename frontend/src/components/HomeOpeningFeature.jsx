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
      <div className="home-opening-feature-meta"><span>最近记录</span><span>{author} · {postTypeLabel(post.post_type)}</span></div>
      <h2><Link to={href} state={{ fromHomeFeed: true }} onClick={rememberDeparture}>{title}</Link></h2>
      <div className="home-opening-feature-footer">
        <span>{summary || formatDate(post.semantic_time || post.published_at)}</span>
        <Link to={href} state={{ fromHomeFeed: true }} onClick={rememberDeparture}>查看记录 ↗</Link>
      </div>
    </> : <>
      <div className="home-opening-feature-meta"><span>最近记录</span><span></span></div>
      <h2>{loading ? "正在加载最近记录…" : "暂无可读记录"}</h2>
      <div className="home-opening-feature-footer"><span>{loading ? "" : ""}</span></div>
    </>}
  </article>;
}
