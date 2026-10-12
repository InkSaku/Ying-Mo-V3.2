import { pinyin } from "pinyin-pro";

export function articleSlugFromTitle(value) {
  const title = String(value || "").trim();
  if (!title) return "";
  const slug = pinyin(title, { toneType: "none", type: "array", nonZh: "consecutive" })
    .join("-")
    .replace(/ü/g, "v")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
  if (slug) return slug;
  // Symbol-only titles still get a stable, valid address.
  let hash = 2166136261;
  for (const character of title) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return `article-${(hash >>> 0).toString(36)}`;
}

export function usesAutomaticArticleSlug(form) {
  if (typeof form.slug_auto === "boolean") return form.slug_auto;
  return !form.slug || form.slug === articleSlugFromTitle(form.title);
}

export function articleSlugWithSuffix(slug, suffix) {
  const ending = `-${suffix}`;
  return `${slug.slice(0, 180 - ending.length).replace(/-+$/g, "")}${ending}`;
}

export function updateTitleAndSlug(form, title, published = false) {
  const automatic = usesAutomaticArticleSlug(form);
  return {
    ...form,
    title,
    slug_auto: automatic,
    slug: form.post_type === "article" && !published && automatic ? articleSlugFromTitle(title) : form.slug,
  };
}
