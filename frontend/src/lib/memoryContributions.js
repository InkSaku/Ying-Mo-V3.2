export function memoryDraftKey(userId, rootPostId) {
  return `yingmo:memory-contribution:v1:${Number(userId)}:${Number(rootPostId)}`;
}

export function readMemoryDraft(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    if (!value || typeof value !== "object" || typeof value.requestId !== "string") return null;
    return {
      requestId: value.requestId,
      postId: Number.isSafeInteger(Number(value.postId)) ? Number(value.postId) : null,
      body: typeof value.body === "string" ? value.body : "",
      occurredAt: typeof value.occurredAt === "string" ? value.occurredAt : "",
      location: typeof value.location === "string" ? value.location : "",
    };
  } catch {
    return null;
  }
}

export function writeMemoryDraft(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeMemoryDraft(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Local recovery is supportive; the server remains authoritative.
  }
}

export function localDateTimeValue(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function memoryContributionPayload(form, expectedVersion) {
  return {
    body: form.body.trim() || null,
    occurred_at: form.occurredAt ? new Date(form.occurredAt).toISOString() : null,
    location: form.location.trim() || null,
    expected_version: expectedVersion,
  };
}
