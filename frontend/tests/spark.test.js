import assert from "node:assert/strict";
import test from "node:test";
import { sparkMessages, sparkTime, sparkStatusLabels, sparkJobPhase, sparkJobRecovery, sparkDuration, sparkJobDuration } from "../src/lib/spark.js";

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

test("old sync failures offer recovery without asking members to diagnose a server", () => {
  const recovery = sparkJobRecovery({ kind: "sync", status: "failed", result: { message: "后台执行失败，请检查服务运行状态后重试" } });
  assert.equal(recovery.retryKind, "sync");
  assert.match(recovery.message, /不会发送消息/);
  assert.match(recovery.hint, /联系网站管理员.*记录的时间/);
  assert.doesNotMatch(JSON.stringify(recovery), /检查服务运行状态|重新扫码/);
  assert.match(sparkJobRecovery({ kind: "sync", status: "failed", result: { message: "执行超时" } }).message, /等待时间过长/);
  assert.match(sparkJobRecovery({ kind: "sync", status: "failed", result: { message: "服务已重启" } }).message, /服务重新启动/);
  assert.equal(sparkJobRecovery({ kind: "sync", status: "succeeded" }), null);
});

test("expired, blocked and unreadable credentials lead to connection steps", () => {
  for (const status of ["expired", "blocked"]) {
    const recovery = sparkJobRecovery({ kind: "sync", status, result: {} });
    assert.equal(recovery.target, "#spark-step-1");
    assert.equal(recovery.retryKind, undefined);
  }
  const recovery = sparkJobRecovery({ kind: "sync", status: "failed", result: { error_code: "CREDENTIAL_UNREADABLE" } });
  assert.equal(recovery.target, "#spark-step-1");
  assert.match(recovery.message, /重新扫码/);
});

test("send failures never offer a direct retry, including uncertain partial sends", () => {
  for (const status of ["failed", "partial", "unknown", "expired", "blocked"]) {
    const recovery = sparkJobRecovery({ kind: "send", status, result: {} });
    assert.equal(recovery.retryKind, undefined);
    assert.match(`${recovery.message}${recovery.hint}`, /核对聊天记录/);
  }
  const recovery = sparkJobRecovery({ kind: "send", status: "partial", result: { events: [{ status: "unknown" }] } });
  assert.match(recovery.message, /不会自动重发/);
  assert.equal(recovery.target, null);
});
