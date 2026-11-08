import { logicalMediaFromPostDisplay, postVisualBadge } from "../lib/mediaGallery";
import { postGalleryLoader } from "../lib/postGallery";
import { MediaOpenButton } from "./MediaOpenButton";
import { ProtectedImage } from "./ProtectedImage";

export function PostCardMedia({ post, media, compact, label }) {
  if (!media) return null;
  const badge = postVisualBadge(post);
  return (
    <MediaOpenButton item={logicalMediaFromPostDisplay(post)} loadItems={postGalleryLoader(post)} context="post-card" label={badge.label ? `${label}（${badge.label}）` : label}>
      <ProtectedImage media={media} adaptive alt="" className={`card-cover ${compact ? "card-cover-compact" : ""}`} />
      {badge.text ? <span className="media-kind-badge" aria-hidden="true">{badge.text}</span> : null}
    </MediaOpenButton>
  );
}
