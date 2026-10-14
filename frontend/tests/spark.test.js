import assert from "node:assert/strict";
import test from "node:test";
import { sparkMessages, sparkTime, sparkStatusLabels, sparkJobPhase, sparkDuration, sparkJobDuration } from "../src/lib/spark.js";

test("spark schedule displays Beijing time independently of browser timezone", () => {
  assert.match(sparkTime("2026-10-14T13:00:00Z"), /21:00/);
  assert.equal(sparkTime(null), "尚未安排");
});

test("message templates preserve separate lines and uncertain sends stay explicit", () => {
  assert.deepEqual(sparkMessages("  晚安\n\n今天也要开心  \r\n"), ["晚安", "今天也要开心"]);
  assert.equal(sparkStatusLabels.unknown, "结果待确认");
  assert.equal(sparkStatusLabels.queued, "排队中");
});

test("queue phases distinguish ready, scheduled, stopping and offline tasks", () => {
  const now = Date.parse("2026-10-14T13:00:00Z");
  const job = { status: "queued", scheduled_at: "2026-10-14T12:59:00Z" };
  assert.equal(sparkJobPhase(job, true, now).key, "queued");
  assert.equal(sparkJobPhase(job, false, now).label, "等待服务恢复");
  assert.equal(sparkJobPhase({ ...job, scheduled_at: "2026-10-14T13:01:00Z" }, true, now).key, "scheduled");
  assert.equal(sparkJobPhase({ ...job, cancel_requested: true }, true, now).key, "stopping");
  assert.equal(sparkJobPhase({ ...job, status: "running" }, false, now).label, "状态待同步");
  assert.equal(sparkJobPhase({ ...job, status: "succeeded" }, false, now).key, "succeeded");
});

test("timers measure ready waiting or execution and do not include scheduled delay", () => {
  const now = Date.parse("2026-10-14T13:00:00Z");
  const job = { status: "queued", created_at: "2026-10-13T13:00:00Z", scheduled_at: "2026-10-14T12:59:00Z" };
  assert.equal(sparkJobDuration(job, now), "01:00");
  assert.equal(sparkJobDuration({ ...job, status: "running", started_at: "2026-10-14T12:59:45Z" }, now), "00:15");
  assert.equal(sparkDuration("2026-10-14T11:59:00Z", now), "01:01:00");
  assert.equal(sparkDuration("2026-10-14T13:01:00Z", now), "00:00");
  assert.equal(sparkDuration(null, now), "—");
  assert.equal(sparkDuration("invalid", now), "—");
});
