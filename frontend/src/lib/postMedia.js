export function manageableMediaRows(media = []) {
  const rows = [];
  const handledPairs = new Set();
  for (const item of media) {
    if (item.live_photo_pair_id) {
      if (handledPairs.has(item.live_photo_pair_id)) continue;
      handledPairs.add(item.live_photo_pair_id);
      const pair = media.filter((candidate) => candidate.live_photo_pair_id === item.live_photo_pair_id);
      rows.push({
        id: item.live_photo_pair_id,
        kind: "live_photo",
        primary: pair.find((candidate) => candidate.kind === "live_photo_image") || item,
        items: pair,
      });
    } else if (item.kind !== "live_photo_video") {
      rows.push({ id: item.id, kind: "image", primary: item, items: [item] });
    }
  }
  return rows;
}

export function mediaPresentation(media) {
  return {
    alt_text: media?.alt_text || "",
    caption: media?.caption || "",
    display_size: ["small", "medium", "large", "full"].includes(media?.display_size)
      ? media.display_size
      : "medium",
    alignment: ["left", "center", "right"].includes(media?.alignment)
      ? media.alignment
      : "center",
  };
}
