import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveApiPath,
  archiveRangeLabel,
  archiveSearchParams,
  groupArchiveFacets,
  readArchiveSelection,
} from "../src/lib/archive.js";

test("normalizes archive URL state and builds paginated API paths", () => {
  const selection = readArchiveSelection(new URLSearchParams("year=2024&month=02&page=3"));
  assert.deepEqual(selection, {
    year: "2024", month: "2", author: "", category: "", tag: "", collection: "", page: 3,
  });
  assert.equal(archiveSearchParams(selection).toString(), "year=2024&month=2&page=3");
  assert.equal(archiveApiPath(selection, 20), "/archive/2024/2?page=3&page_size=20");
  assert.equal(archiveRangeLabel(selection), "2024 年 02 月");

  const invalid = readArchiveSelection(new URLSearchParams("year=twenty&month=13&page=0"));
  assert.deepEqual(invalid, {
    year: "", month: "", author: "", category: "", tag: "", collection: "", page: 1,
  });
  assert.equal(archiveSearchParams(invalid).toString(), "");
  assert.equal(archiveApiPath(invalid), "/archive?page=1&page_size=20");
});

test("preserves archive filters in shareable URLs and API requests", () => {
  const selection = readArchiveSelection(new URLSearchParams(
    "year=2025&author=alice&category=travel&tag=japan&collection=tokyo&page=2"
  ));
  assert.equal(
    archiveSearchParams(selection).toString(),
    "year=2025&author=alice&category=travel&tag=japan&collection=tokyo&page=2"
  );
  assert.equal(
    archiveApiPath(selection),
    "/archive/2025?author=alice&category=travel&tag=japan&collection=tokyo&page=2&page_size=20"
  );
});

test("groups month facets into descending years with ACL-derived totals", () => {
  const groups = groupArchiveFacets([
    { year: 2023, month: 12, count: 2 },
    { year: 2024, month: 1, count: 21 },
    { year: 2024, month: 3, count: 4 },
    { year: 2024, month: 99, count: 100 },
  ]);

  assert.deepEqual(groups, [
    {
      year: 2024,
      count: 25,
      months: [
        { year: 2024, month: 3, count: 4 },
        { year: 2024, month: 1, count: 21 },
      ],
    },
    {
      year: 2023,
      count: 2,
      months: [{ year: 2023, month: 12, count: 2 }],
    },
  ]);
});
