import { mediaIdsInMarkdown } from "../lib/internalMedia";
import { ProtectedImage } from "./ProtectedImage";
import { ProtectedVideo } from "./ProtectedVideo";

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

export function PostMediaGallery({ media, coverMediaId, body = "" }) {
  const groups = mediaGroups(media, coverMediaId, mediaIdsInMarkdown(body));
  if (!groups.length) return null;

  return (
    <section className="post-media-gallery" aria-label="内容媒体">
      {groups.map((group) => group.type === "live" ? (
        <figure className="live-photo-view" key={group.id}>
          <ProtectedImage path={group.image?.read_path} alt="随内容记录的 Live Photo 静态画面" className="post-media-image" />
          <ProtectedVideo path={group.video?.read_path} label="Live Photo 动态片段" className="post-media-video" />
          <figcaption>Live Photo</figcaption>
        </figure>
      ) : (
        <figure className="post-media-view" key={group.id}>
          <ProtectedImage path={group.image?.read_path} alt="随内容上传的图片" className="post-media-image" />
        </figure>
      ))}
    </section>
  );
}
