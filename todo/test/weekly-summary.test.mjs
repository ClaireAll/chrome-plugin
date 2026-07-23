import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklySummary, getWeekRange } from "../src/shared/weekly-summary.js";

test("week range starts Monday and ends Sunday in local time", () => {
  const range = getWeekRange(new Date("2026-07-23T12:00:00"));

  assert.equal(range.start.getDay(), 1);
  assert.equal(range.end.getDay(), 0);
});

test("weekly summary uses only occupied hours and adds weekend columns only when needed", () => {
  const summary = buildWeeklySummary(
    [
      { text: "Monday task", completedAt: "2026-07-20T09:30:00" },
      { text: "Friday task", completedAt: "2026-07-24T14:00:00" },
      { text: "Saturday task", completedAt: "2026-07-25T21:00:00" }
    ],
    new Date("2026-07-23T12:00:00")
  );

  assert.deepEqual(summary.hours, ["09:00", "14:00", "21:00"]);
  assert.deepEqual(summary.days.map((day) => day.key), ["mon", "tue", "wed", "thu", "fri", "sat"]);
  assert.equal(summary.cells["09:00|mon"].tasks[0], "Monday task");
  assert.equal(summary.cells["21:00|sat"].tasks[0], "Saturday task");
});
