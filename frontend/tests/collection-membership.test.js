import test from "node:test";
import assert from "node:assert/strict";

import { collectionMemberSettingsPayload } from "../src/lib/collectionMembership.js";


test("future-member policy is explicit and current-member selection stays a snapshot", () => {
  assert.deepEqual(collectionMemberSettingsPayload({
    selected: [2, 5],
    autoAddFutureMembers: true,
  }), {
    member_ids: [2, 5],
    auto_add_future_members: true,
  });

  assert.deepEqual(collectionMemberSettingsPayload({
    selectAll: true,
    selected: [2],
    autoAddFutureMembers: false,
  }), {
    select_all_members: true,
    auto_add_future_members: false,
  });
});
