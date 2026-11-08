import { mediaIdsInMarkdown } from "../lib/internalMedia";
import { ProtectedImage } from "./ProtectedImage";
import { LivePhotoFrame } from "./LivePhotoFrame";
import { MediaOpenButton } from "./MediaOpenButton";

function mediaGroups(media, coverMediaId, inlineMediaIds) {
  const rows = [];
  const handledPairs = new Set();
  for (const item of media || []) {
    if (item.id === coverMediaId) continue;
    if (item.live_photo_pair_id) {
      if (handledPairs.has(item.live_photo_pair_id)) continue;
      handledPairs.add(item.live_photo_pair_id);
      const pair = (media || []).filter((candidate) => candidate.live_photo_pair_id === item.live_photo_pair_id);
      if (pair.some((candidate) => inlineMediaIds.has(Number(candidate.id)))) continue;
      rows.push({ type: "live", id: item.live_photo_pair_id, image: pair.find((candidate) => candidate.kind === "live_photo_image"), video: pair.find((candidate) => candidate.kind === "live_photo_video") });
    } else if (item.kind !== "live_photo_video" && !inlineMediaIds.has(Number(item.id))) {
      rows.push({ type: "image", id: item.id, image: item });
    }
  }
  return rows;
}

export function PostMediaGallery({ media, coverMediaId, body = "", galleryItems = [] }) {
  const groups = mediaGroups(media, coverMediaId, mediaIdsInMarkdown(body));
  if (!groups.length) return null;

  return (
    <section className="post-media-gallery" aria-label="内容媒体">
      {groups.map((group) => group.type === "live" ? (
        <figure className="live-photo-view" key={group.id}>
          <LivePhotoFrame
            imagePath={group.image?.read_path}
            videoPath={group.video?.read_path}
            alt={group.image?.alt_text || ""}
            imageClassName="post-media-image"
            galleryItem={galleryItems.find((item) => item.id === group.image?.public_id)}
            galleryItems={galleryItems}
          />
          {group.image?.caption ? <figcaption>{group.image.caption}</figcaption> : null}
        </figure>
      ) : (
        <figure className="post-media-view" key={group.id}>
          <MediaOpenButton item={galleryItems.find((item) => item.id === group.image?.public_id)} items={galleryItems} context="post"><ProtectedImage eager path={group.image?.read_path} alt={group.image?.alt_text || ""} className="post-media-image" /></MediaOpenButton>
          {group.image?.caption ? <figcaption>{group.image.caption}</figcaption> : null}
        </figure>
      ))}
    </section>
  );
}
