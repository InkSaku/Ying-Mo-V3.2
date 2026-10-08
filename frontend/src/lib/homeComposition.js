// Use only records returned by the member-scoped feed. Never fetch arbitrary
// users' media to fill decorative slots, or repeat the same photo in a collage.
export function homeCollagePhotos(posts = []) {
  const seen = new Set();
  const photos = [];
  for (const post of posts) {
    const media = post.display_media || post.cover_media;
    const source = media?.read_path || media?.thumbnail_path;
    if (!source || seen.has(source)) continue;
    seen.add(source);
    photos.push({ post, media });
    if (photos.length === 4) break;
  }
  return photos;
}

export function homeFeaturePost(posts = []) {
  const hasImage = (post) => Boolean(
    post?.display_media?.read_path || post?.display_media?.thumbnail_path
    || post?.cover_media?.read_path || post?.cover_media?.thumbnail_path
  );
  return posts.find((post) => post.post_type === "article" && hasImage(post))
    || posts.find(hasImage)
    || posts.find((post) => post.post_type === "article")
    || posts[0]
    || null;
}
