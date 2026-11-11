import { excerpt, postTypeLabel } from "./format";

const NUMERALS = ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const DAY_MS = 86_400_000;
const LABEL_LIMIT = 24;

const spoken = (value) => NUMERALS[value] ?? String(value);

function elapsedDays(from, to) {
  const start = new Date(from || "").getTime();
  const end = new Date(to || "").getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.floor((end - start) / DAY_MS);
}

function spanLabel(days) {
  if (days < 7) return `${spoken(days)}天`;
  if (days < 30) return `${spoken(Math.floor(days / 7))}周`;
  const months = Math.round(days / 30.44);
  if (months === 6) return "半年";
  if (months < 12) return `${spoken(months)}个月`;
  const years = Math.max(1, Math.floor(days / 365.25));
  return `${spoken(years)}年${days - years * 365.25 >= 182.6 ? "半" : ""}`;
}

// 用两篇之间的间隔而不是“距今多久”，一年后再读这句话依然成立。
export function continuationGapLabel(from, to) {
  const days = elapsedDays(from, to);
  if (days === null) return "";
  return days === 0 ? "当天" : `隔了${spanLabel(days)}`;
}

export function continuationAfterLabel(from, to) {
  const days = elapsedDays(from, to);
  if (days === null) return "";
  return days === 0 ? "当天" : `${spanLabel(days)}后`;
}

// 随记可以没有标题，这时用正文开头当名字。
export function continuationLabel(post) {
  if (post?.title) return post.title;
  // 名字里只留链接文字，不露出网址。
  const source = String(post?.content_excerpt || post?.summary || post?.body || "").replace(/\[([^\]\n]*)\]\([^)\s]*\)/g, "$1");
  const text = excerpt({ content_excerpt: source });
  if (!text) return `一则${postTypeLabel(post?.post_type)}`;
  return text.length > LABEL_LIMIT ? `${text.slice(0, LABEL_LIMIT)}…` : text;
}
