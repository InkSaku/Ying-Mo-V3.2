import assert from "node:assert/strict";
import test from "node:test";
import { sparkMessages, sparkTime, sparkStatusLabels } from "../src/lib/spark.js";

test("spark schedule displays Beijing time independently of browser timezone", () => {
  assert.match(sparkTime("2026-10-14T13:00:00Z"), /21:00/);
  assert.equal(sparkTime(null), "尚未安排");
});

test("message templates preserve separate lines and uncertain sends stay explicit", () => {
  assert.deepEqual(sparkMessages("  晚安\n\n今天也要开心  \r\n"), ["晚安", "今天也要开心"]);
  assert.equal(sparkStatusLabels.unknown, "结果待确认");
  assert.equal(sparkStatusLabels.queued, "等待执行");
});
