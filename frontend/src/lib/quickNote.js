import { offlineDraftKey, readOfflineDraft, removeOfflineDraft, writeOfflineDraft } from "./offlineDraft.js";

export function initialQuickNoteForm() {
  return {
    body: "",
    visibility: "private",
    collection_id: "",
    occurred_at: "",
    location: "",
    mood: "",
  };
}

export function quickNoteDraftKey(userId) {
  return offlineDraftKey(userId, null, "quick-note");
}

export function quickNotePayload(form) {
  const collectionId = form.collection_id ? Number(form.collection_id) : null;
  return {
    post_type: "note",
    body: form.body.trim() || null,
    visibility: collectionId ? "private" : form.visibility,
    collection_id: collectionId,
    tag_names: [],
    title: null,
    summary: null,
    occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : null,
    location: form.location.trim() || null,
    mood: form.mood.trim() || null,
    external_video_url: null,
  };
}

export function quickNoteAudienceValue(form) {
  return form.collection_id ? `collection:${form.collection_id}` : form.visibility;
}

export function formWithQuickNoteAudience(form, value) {
  if (value.startsWith("collection:")) {
    return { ...form, collection_id: value.slice("collection:".length), visibility: "private" };
  }
  return { ...form, collection_id: "", visibility: value === "login_only" ? "login_only" : "private" };
}

export function quickNoteHasLocalContent(form, postId = null) {
  return Boolean(
    postId
    || form.body.trim()
    || form.collection_id
    || form.occurred_at
    || form.location.trim()
    || form.mood.trim()
    || form.visibility !== "private"
  );
}

export function readQuickNoteDraft(storage, key) {
  const stored = readOfflineDraft(storage, key);
  const snapshot = stored?.form;
  if (!snapshot || typeof snapshot !== "object" || !snapshot.form) return null;
  return {
    saved_at: stored.saved_at,
    post_id: Number.isSafeInteger(Number(snapshot.post_id)) && Number(snapshot.post_id) > 0
      ? Number(snapshot.post_id)
      : null,
    form: { ...initialQuickNoteForm(), ...snapshot.form },
  };
}

export function writeQuickNoteDraft(storage, key, form, postId = null, savedAt = new Date()) {
  return writeOfflineDraft(storage, key, { form, post_id: postId }, savedAt);
}

export function removeQuickNoteDraft(storage, key) {
  return removeOfflineDraft(storage, key);
}

export function quickNoteBrowseItem(post) {
  const visual = (post.bound_media || []).find((item) => (
    item.status === "active"
    && !item.deleted_at
    && ["image", "live_photo_image"].includes(item.kind)
  ));
  return {
    ...post,
    display_media: post.cover_media || visual || null,
  };
}
