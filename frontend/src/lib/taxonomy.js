export function summarizeTaxonomyItems(items = []) {
  const counts = items.map((item) => {
    const value = Number(item?.visible_post_count);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });

  return {
    itemCount: items.length,
    postCount: counts.reduce((sum, count) => sum + count, 0),
    maxCount: counts.length ? Math.max(...counts) : 0,
  };
}

export function taxonomyTagProminence(item, maxCount) {
  const count = Number(item?.visible_post_count) || 0;
  if (!maxCount || count <= 0) return "quiet";
  if (count >= maxCount * 0.66) return "prominent";
  if (count >= maxCount * 0.33) return "regular";
  return "quiet";
}

export function summarizeTaxonomyPosts(posts = []) {
  return posts.reduce(
    (summary, post) => {
      if (post?.post_type === "article") summary.articles += 1;
      if (post?.post_type === "note") summary.notes += 1;
      return summary;
    },
    { articles: 0, notes: 0 }
  );
}
