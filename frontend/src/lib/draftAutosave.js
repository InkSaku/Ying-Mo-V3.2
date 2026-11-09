import { selectedTagNames } from "./tagSelection.js";

export const AUTOSAVE_DELAY = 1200;

export function draftPayloadFromForm(form) {
  const tagNames = selectedTagNames(form.tag_names);
  const inCollection = Boolean(form.collection_id);
  const common = {
    post_type: form.post_type,
    body: form.body || null,
    visibility: inCollection ? "private" : form.visibility,
    collection_id: form.collection_id ? Number(form.collection_id) : null,
    // 只在作者这次动过位置时发送：别人挪动内容不增加编辑版本，旧表单不能把它挪回去。
    ...(form.collection_folder_changed
      ? { collection_folder_id: inCollection && form.collection_folder_id ? Number(form.collection_folder_id) : null }
      : {}),
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

// 位置写入后后续保存不再带目录字段，指纹也要去掉它，否则会多触发一次自动保存。
export function savedDraftFingerprint(snapshot) {
  const settled = { ...snapshot };
  delete settled.collection_folder_id;
  return draftFingerprint(settled);
}

// 除了位置什么都没改：按移动处理，不算编辑，不推进版本也不刷新更新时间。
export function isFolderOnlySave(snapshot, lastSavedFingerprint) {
  return Boolean(snapshot.collection_id)
    && "collection_folder_id" in snapshot
    && savedDraftFingerprint(snapshot) === lastSavedFingerprint;
}

// 保存成功后清掉“位置已修改”标记并跟上服务端位置，别人后来的移动才不会被旧表单改回去。
export function settleSavedFolder(form, snapshot, saved) {
  if (form.collection_id !== (saved.collection_id ? String(saved.collection_id) : "")) return form;
  // 保存途中作者又改了位置：这次改动还没发出去，留给下一次保存。
  if (form.collection_folder_changed && draftPayloadFromForm(form).collection_folder_id !== snapshot.collection_folder_id) return form;
  const folderId = saved.collection_folder_id ? String(saved.collection_folder_id) : "";
  if (!form.collection_folder_changed && form.collection_folder_id === folderId) return form;
  return { ...form, collection_folder_id: folderId, collection_folder_changed: false };
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
