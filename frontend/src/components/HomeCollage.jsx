import { Link } from "react-router-dom";
import { ProtectedImage } from "./ProtectedImage";
import { postHref } from "../lib/format";
import { homeCollagePhotos } from "../lib/homeComposition";
import riverside from "../assets/home/riverside.jpg";
import desk from "../assets/home/desk.jpg";
import train from "../assets/home/train.jpg";
import coast from "../assets/home/coast.jpg";

const illustrations = [riverside, desk, train, coast];

export function HomeCollage({ posts = [] }) {
  const photos = homeCollagePhotos(posts);
  return (
    <figure className="home-collage" aria-label="日常影像拼贴">
      <div className="home-collage-photos">
        {illustrations.map((src, index) => {
          const photo = photos[index];
          const className = `home-collage-photo home-collage-photo-${index + 1}`;
          return photo ? (
            <Link key={photo.post.id} className={className} to={postHref(photo.post)} state={{ fromHomeFeed: true }} aria-label={`翻开${photo.post.author?.nickname || "朋友"}的记录：${photo.post.title || "一则随记"}`}>
              <ProtectedImage media={photo.media} useOriginal alt="" fallback={<span className="home-collage-unavailable">影像暂不可用<br /><small>仍可翻开这则记录 ↗</small></span>} />
              <span className="home-collage-source">{photo.post.author?.nickname || "朋友"}的记录 ↗</span>
            </Link>
          ) : <div key={src} className={className}><img src={src} alt="" decoding="async" fetchPriority={index === 0 ? "high" : "auto"} /></div>;
        })}
      </div>
      <figcaption className="home-collage-caption">
        <p>一些平常，<br />却想记住的瞬间。</p>
        <small>{photos.length === 4 ? "来自可读记录 · 点击影像翻阅" : photos.length ? "记录中的影像，伴以首页意象图" : "映墨首页意象图"}</small>
        <svg viewBox="0 0 94 52" fill="none" aria-hidden="true"><path d="M79 5c15 29-22 34-63 34m0 0 13-9m-13 9 15 5" /></svg>
      </figcaption>
    </figure>
  );
}
