import { Link } from "react-router-dom";
import { continuationLabel } from "../lib/continuations";
import { excerpt, formatDate, postTypeLabel } from "../lib/format";
import { postVisualBadge } from "../lib/mediaGallery";
import { ProtectedImage } from "./ProtectedImage";
import "../styles/post-link-card.css";

// 评论里贴上的站内帖子：一页拿出来给人看的纸，直角细线，有图时图在上。
// 读不到、已删除或不存在都只留一行，不露出标题、作者和图片。
// linked=false 用于发送前的预览：同一张卡片，但点了不离开正在写的评论。
export function PostLinkCard({ card, className = "", linked = true }) {
  if (!card) return null;
  if (card.state !== "available") {
    return <div className={`post-link-card is-unavailable ${className}`}><p>这条记录你暂时读不到</p></div>;
  }
  const media = card.display_media;
  const badge = postVisualBadge({ display_media: media, visual_count: card.visual_count });
  const facts = [postTypeLabel(card.post_type), formatDate(card.published_at), card.author?.nickname].filter(Boolean).join(" · ");
  const text = excerpt(card);
  const label = `${postTypeLabel(card.post_type)}《${continuationLabel(card)}》，${facts}`;
  const content = <>
    {media ? <span className="post-link-card-media">
      <ProtectedImage media={media} adaptive alt="" />
      {badge.text ? <span className="media-kind-badge" aria-hidden="true">{badge.text}</span> : null}
    </span> : null}
    <span className="post-link-card-text" aria-hidden="true">
      <small>{facts}</small>
      {card.title
        ? <><strong>{card.title}</strong>{text ? <span className="post-link-card-excerpt">{text}</span> : null}</>
        : <strong className="post-link-card-note">{text || continuationLabel(card)}</strong>}
    </span>
  </>;
  return linked
    ? <Link className={`post-link-card ${className}`} to={card.canonical} aria-label={label}>{content}</Link>
    : <div className={`post-link-card is-preview ${className}`} role="img" aria-label={label}>{content}</div>;
}
