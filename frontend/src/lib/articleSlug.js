// 拼音词典约 136 KiB（gzip），只有文章网址需要它：写随记或标题还没有汉字时不加载。
let pinyinEngine = null;
let pinyinLoading = null;
const HAN_CHARACTER = /\p{Script=Han}/u;

// 只有含汉字的标题才需要拼音词典。
export function titleNeedsSlugEngine(title) {
  return HAN_CHARACTER.test(String(title || ""));
}

export function loadArticleSlugEngine() {
  if (pinyinEngine) return Promise.resolve(pinyinEngine);
  pinyinLoading ||= import("pinyin-pro")
    .then((module) => {
      pinyinEngine = module.pinyin;
      return pinyinEngine;
    })
    .catch((error) => {
      pinyinLoading = null;
      throw error;
    });
  return pinyinLoading;
}

// 词典还没到时，含汉字的标题先不生成网址（留空，发布按钮保持不可用），等词典到了再补上；
// 不含汉字的标题不需要词典，结果与有词典时一致。
export function articleSlugFromTitle(value) {
  const title = String(value || "").trim();
  if (!title) return "";
  if (!pinyinEngine && HAN_CHARACTER.test(title)) return "";
  const parts = pinyinEngine ? pinyinEngine(title, { toneType: "none", type: "array", nonZh: "consecutive" }) : [title];
  const slug = parts
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
