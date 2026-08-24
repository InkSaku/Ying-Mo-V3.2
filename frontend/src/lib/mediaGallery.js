export function logicalMediaFromRaw(media = [], post = null) {
  const items = [];
  const handledPairs = new Set();
  for (const part of media || []) {
    if (part.kind === "live_photo_video") continue;
    if (part.live_photo_pair_id) {
      if (handledPairs.has(part.live_photo_pair_id)) continue;
      handledPairs.add(part.live_photo_pair_id);
      const pair = media.filter((candidate) => candidate.live_photo_pair_id === part.live_photo_pair_id);
      const image = pair.find((candidate) => candidate.kind === "live_photo_image");
      const video = pair.find((candidate) => candidate.kind === "live_photo_video");
      if (!image) continue;
      items.push({
        id: image.public_id,
        kind: "live_photo",
        image,
        video: video || null,
        live_photo_pair_id: image.live_photo_pair_id,
        live_photo_manifest_path: image.live_photo_manifest_path,
        post,
        author: post?.author || null,
        occurred_at: post?.semantic_time || image.created_at,
        location: post?.location || null,
        permissions: { can_download_original: Boolean(image.original_download_path) },
        downloads: image.original_download_path ? [{ kind: "image", path: image.original_download_path }] : [],
      });
      continue;
    }
    items.push({
      id: part.public_id,
      kind: "image",
      image: part,
      video: null,
      post,
      author: post?.author || null,
      occurred_at: post?.semantic_time || part.created_at,
      location: post?.location || null,
      permissions: { can_download_original: Boolean(part.original_download_path) },
      downloads: part.original_download_path ? [{ kind: "image", path: part.original_download_path }] : [],
    });
  }
  return items;
}

export function logicalMediaFromPostDisplay(post) {
  const image = post?.display_media || post?.cover_media;
  if (!image?.public_id) return null;
  return {
    id: image.public_id,
    kind: image.live_photo_pair_id ? "live_photo" : "image",
    image,
    video: null,
    live_photo_pair_id: image.live_photo_pair_id || null,
    live_photo_manifest_path: image.live_photo_manifest_path || null,
    post,
    author: post.author || null,
    occurred_at: post.semantic_time || image.created_at,
    location: post.location || null,
    permissions: { can_download_original: false },
  };
}

export function mergeMediaItems(current = [], incoming = [], { prepend = false } = {}) {
  const ordered = prepend ? [...incoming, ...current] : [...current, ...incoming];
  const seen = new Set();
  return ordered.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function mediaDisplayPath(item) {
  return item?.image?.display_path || item?.image?.read_path || null;
}

export function mediaThumbnailPath(item) {
  return item?.image?.thumbnail_path || mediaDisplayPath(item);
}

export function withMediaParam(search, mediaId) {
  const params = new URLSearchParams(search || "");
  if (mediaId) params.set("media", mediaId);
  else params.delete("media");
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

export function galleryPosition(firstPosition, index) {
  return Math.max(0, Number(firstPosition) || 0) + Math.max(0, Number(index) || 0) + 1;
}
