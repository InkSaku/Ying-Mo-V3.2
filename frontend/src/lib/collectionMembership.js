export function collectionMemberSettingsPayload({
  selectAll = false,
  selected = [],
  autoAddFutureMembers = false,
} = {}) {
  return {
    ...(selectAll ? { select_all_members: true } : { member_ids: [...selected] }),
    auto_add_future_members: Boolean(autoAddFutureMembers),
  };
}
