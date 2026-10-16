export const revisionFieldLabels = {
  title: "标题",
  summary: "摘要",
  body: "正文",
  content_format: "内容格式",
  cover_media_id: "封面",
  category_id: "分类",
  tag_ids: "标签",
  collection_id: "合集",
  visibility: "阅读范围",
  occurred_at: "记录时间",
  location: "地点",
  mood: "心情",
  external_video_url: "外部视频",
  slug: "网址标识",
};

export function revisionReasonLabel(reason) {
  if (reason === "restore") return "恢复历史版本前保存";
  if (reason === "collection_change") return "合集关系变更前保存";
  return "内容修改前保存";
}

export function revisionChangedLabels(fields = []) {
  return fields.map((field) => revisionFieldLabels[field] || field);
}

export function positiveRevisionParam(value, fallback = 0) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
