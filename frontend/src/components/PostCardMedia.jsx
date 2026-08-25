import { logicalMediaFromPostDisplay } from "../lib/mediaGallery";
import { MediaOpenButton } from "./MediaOpenButton";
import { ProtectedImage } from "./ProtectedImage";

export function PostCardMedia({ post, media, compact, label }) {
  if (!media) return null;
  return (
    <MediaOpenButton item={logicalMediaFromPostDisplay(post)} context="post-card" label={label}>
      <ProtectedImage media={media} alt="" className={`card-cover ${compact ? "card-cover-compact" : ""}`} />
    </MediaOpenButton>
  );
}
