import test from "node:test";
import assert from "node:assert/strict";

import {
  activeCreatorTransferCandidates,
  creatorTransferPayload,
} from "../src/lib/collectionOwnership.js";

test("creator transfer only offers current active members", () => {
  const members = [
    { id: 2, nickname: "Active" },
    { id: 3, nickname: "Unavailable" },
    { id: 2, nickname: "Duplicate" },
  ];
  assert.deepEqual(
    activeCreatorTransferCandidates(members, [{ id: 2 }, { id: 4 }]),
    [{ id: 2, nickname: "Active" }],
  );
});

test("creator transfer payload accepts only a positive integer target", () => {
  assert.deepEqual(creatorTransferPayload("42"), { new_creator_id: 42 });
  assert.equal(creatorTransferPayload(""), null);
  assert.equal(creatorTransferPayload("4.2"), null);
});
