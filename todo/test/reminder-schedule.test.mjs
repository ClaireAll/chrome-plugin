import test from "node:test";
import assert from "node:assert/strict";
import { alarmNameForTodo, isReminderOnTime, todoIdFromAlarmName } from "../src/shared/reminder-schedule.ts";

test("alarm names encode and decode todo ids", () => {
  assert.equal(alarmNameForTodo("abc"), "todo-reminder:abc");
  assert.equal(todoIdFromAlarmName("todo-reminder:abc"), "abc");
  assert.equal(todoIdFromAlarmName("other"), "");
});

test("reminder on-time check allows two minutes and rejects late backfill", () => {
  assert.equal(isReminderOnTime("2026-07-23T09:00:00.000Z", "2026-07-23T09:01:59.000Z"), true);
  assert.equal(isReminderOnTime("2026-07-23T09:00:00.000Z", "2026-07-23T09:02:01.000Z"), false);
  assert.equal(isReminderOnTime("2026-07-23T09:00:00.000Z", "2026-07-23T08:59:59.000Z"), false);
});
