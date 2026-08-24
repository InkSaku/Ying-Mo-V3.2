export function activeCreatorTransferCandidates(members = [], activeOptions = []) {
  const activeIds = new Set(activeOptions.map((member) => member.id));
  const seen = new Set();
  return members.filter((member) => {
    if (!activeIds.has(member.id) || seen.has(member.id)) return false;
    seen.add(member.id);
    return true;
  });
}

export function creatorTransferPayload(value) {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { new_creator_id: id };
}
