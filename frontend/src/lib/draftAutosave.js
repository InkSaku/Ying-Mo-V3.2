export const AUTOSAVE_DELAY = 1200;

export function draftPayloadFromForm(form) {
  const tagNames = form.tag_names
    ? form.tag_names.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const inCollection = Boolean(form.collection_id);
  const common = {
    post_type: form.post_type,
    body: form.body || null,
    visibility: inCollection ? "private" : form.visibility,
    collection_id: form.collection_id ? Number(form.collection_id) : null,
    tag_names: tagNames,
  };
  if (form.post_type === "article") {
    return {
      ...common,
      title: form.title || null,
      summary: form.summary || null,
      slug: form.slug || null,
      category_id: form.category_id ? Number(form.category_id) : null,
    };
  }
  return {
    ...common,
    title: form.title || null,
    summary: form.summary || null,
    occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : null,
    location: form.location || null,
    mood: form.mood || null,
    external_video_url: form.external_video_url || null,
  };
}

export function draftFingerprint(payload) {
  return JSON.stringify(payload);
}

export function autosaveStatusLabel(state, canAutosave = true) {
  if (!canAutosave) return "已发布内容仅手动保存";
  if (state.status === "dirty") return "有未保存修改";
  if (state.status === "saving") return "正在自动保存…";
  if (state.status === "saved") {
    return state.savedAt
      ? `已自动保存 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(state.savedAt)}`
      : "已自动保存";
  }
  if (state.status === "error") return "自动保存失败，本地内容仍保留";
  if (state.status === "conflict") return "检测到其他窗口的修改";
  return "尚无未保存修改";
}
