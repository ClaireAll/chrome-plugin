import test from "node:test";
import assert from "node:assert/strict";
import {
  addTodoItem,
  appendCompletedRecord,
  clearTodoReminder,
  createEmptyCompletedData,
  createTodoItem,
  deleteCompletedRecord,
  deleteTodoItem,
  getTodoTimerElapsedMs,
  markTodoReminded,
  normalizeCompletedData,
  normalizeTodoItems,
  pauseRunningTodoTimers,
  reorderTodoItems,
  searchCompletedRecords,
  setTodoReminder,
  toggleFocusedTodoTimer,
  toggleTodoTimer,
  touchRunningTodoTimer,
  updateCompletedRecordText,
  updateTodoColor,
  updateTodoText
} from "../src/shared/domain.js";

const settings = {
  colorPresets: ["#ffffff", "#fef3c7", "#dcfce7"],
  defaultColor: "#ffffff"
};

test("todo items are normalized and empty text is removed", () => {
  const items = normalizeTodoItems([
    { id: "a", text: "  keep  ", color: "#badbad", reminderAt: "bad", reminded: "no" },
    { id: "b", text: "   " }
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "a");
  assert.equal(items[0].text, "keep");
  assert.equal(items[0].color, "#badbad");
  assert.equal(items[0].reminderAt, "");
  assert.equal(items[0].reminded, false);
});

test("todo item dates are normalized with deterministic fallback order", () => {
  const items = normalizeTodoItems([
    {
      id: "created-invalid",
      text: "Created fallback",
      createdAt: "bad",
      updatedAt: "2026-07-23T08:00:00Z"
    },
    {
      id: "updated-invalid",
      text: "Updated fallback",
      createdAt: "2026-07-23T09:00:00Z",
      updatedAt: "bad"
    },
    {
      id: "both-invalid",
      text: "Now fallback",
      createdAt: "bad",
      updatedAt: "also bad"
    }
  ]);

  assert.equal(items[0].createdAt, "2026-07-23T08:00:00.000Z");
  assert.equal(items[0].updatedAt, "2026-07-23T08:00:00.000Z");
  assert.equal(items[1].createdAt, "2026-07-23T09:00:00.000Z");
  assert.equal(items[1].updatedAt, "2026-07-23T09:00:00.000Z");
  assert.match(items[2].createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(items[2].createdAt, items[2].updatedAt);
});

test("createTodoItem normalizes direct input and reminder state", () => {
  assert.deepEqual(createTodoItem("  New task  ", {
    id: "new-task",
    color: "#dcfce7",
    reminderAt: "2026-07-23T10:00:00Z",
    reminded: true
  }, "2026-07-23T08:00:00Z"), {
    id: "new-task",
    text: "New task",
    color: "#dcfce7",
    reminderAt: "2026-07-23T10:00:00.000Z",
    reminded: true,
    timerState: "idle",
    timerElapsedMs: 0,
    timerStartedAt: "",
    timerLastTickAt: "",
    timerFirstStartedAt: "",
    timerFocused: false,
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z"
  });
});

test("markTodoReminded preserves false when an item has no reminder", () => {
  const items = [{
    id: "no-reminder",
    text: "No reminder",
    reminderAt: "",
    reminded: false,
    createdAt: "2026-07-23T08:00:00Z",
    updatedAt: "2026-07-23T08:00:00Z"
  }];

  const marked = markTodoReminded(items, "no-reminder", "2026-07-23T09:00:00Z");

  assert.equal(marked[0].reminded, false);
});

test("todo timers can run together and keep the earliest timer focused", () => {
  const items = normalizeTodoItems([
    {
      id: "a",
      text: "Task A",
      timerState: "running",
      timerElapsedMs: 30000,
      timerStartedAt: "2026-07-23T09:00:00.000Z",
      timerLastTickAt: "2026-07-23T09:00:30.000Z",
      timerFirstStartedAt: "2026-07-23T09:00:00.000Z",
      timerFocused: true
    },
    { id: "b", text: "Task B" }
  ]);

  const switched = toggleTodoTimer(items, "b", "2026-07-23T09:01:00.000Z");
  assert.equal(switched[0].timerState, "running");
  assert.equal(switched[0].timerElapsedMs, 30000);
  assert.equal(switched[0].timerStartedAt, "2026-07-23T09:00:00.000Z");
  assert.equal(switched[0].timerFocused, true);
  assert.equal(switched[1].timerState, "running");
  assert.equal(switched[1].timerFocused, false);
  assert.equal(switched[1].timerStartedAt, "2026-07-23T09:01:00.000Z");
  assert.equal(switched[1].timerFirstStartedAt, "2026-07-23T09:01:00.000Z");

  const paused = toggleTodoTimer(switched, "b", "2026-07-23T09:02:15.000Z");
  assert.equal(paused[1].timerState, "paused");
  assert.equal(paused[1].timerElapsedMs, 75000);
  assert.equal(paused[1].timerFocused, false);

  const resumed = toggleFocusedTodoTimer(paused, "2026-07-23T09:03:00.000Z");
  assert.equal(resumed[0].timerState, "paused");
  assert.equal(resumed[0].timerElapsedMs, 210000);
  assert.equal(resumed[0].timerFocused, true);
  assert.equal(resumed[1].timerState, "paused");
  assert.equal(resumed[1].timerElapsedMs, 75000);
  assert.equal(resumed[1].timerFocused, false);

  const restarted = toggleFocusedTodoTimer(resumed, "2026-07-23T09:04:00.000Z");
  assert.deepEqual(restarted.map((item) => item.timerState), ["running", "running"]);
  assert.equal(restarted[0].timerStartedAt, "2026-07-23T09:04:00.000Z");
  assert.equal(restarted[1].timerStartedAt, "2026-07-23T09:04:00.000Z");
  assert.equal(restarted[0].timerFocused, true);
  assert.equal(restarted[1].timerFocused, false);
});

test("running timer heartbeat and startup pause preserve the last known elapsed time", () => {
  const running = toggleTodoTimer([
    { id: "a", text: "Task A" },
    { id: "b", text: "Task B" }
  ], "a", "2026-07-23T09:00:00.000Z");
  const runningTogether = toggleTodoTimer(running, "b", "2026-07-23T09:00:15.000Z");
  const touched = touchRunningTodoTimer(runningTogether, "", "2026-07-23T09:00:45.000Z");
  assert.equal(touched[0].timerLastTickAt, "2026-07-23T09:00:45.000Z");
  assert.equal(touched[1].timerLastTickAt, "2026-07-23T09:00:45.000Z");
  assert.equal(getTodoTimerElapsedMs(touched[0], "2026-07-23T09:01:15.000Z"), 75000);

  const paused = pauseRunningTodoTimers(touched, "2026-07-23T10:00:00.000Z", { useLastTick: true });
  assert.equal(paused[0].timerState, "paused");
  assert.equal(paused[0].timerElapsedMs, 45000);
  assert.equal(paused[0].timerStartedAt, "");
  assert.equal(paused[1].timerState, "paused");
  assert.equal(paused[1].timerElapsedMs, 30000);
  assert.equal(paused[1].timerStartedAt, "");
});

test("todo mutations add, edit, color, reminder, remind, clear, delete, and reorder", () => {
  const first = addTodoItem([], "First", settings, "2026-07-23T08:00:00.000Z");
  const second = addTodoItem(first, "Second", settings, "2026-07-23T08:01:00.000Z");
  const firstId = second[0].id;
  const secondId = second[1].id;

  const renamed = updateTodoText(second, firstId, "First updated", "2026-07-23T08:02:00.000Z");
  assert.equal(renamed[0].text, "First updated");

  const colored = updateTodoColor(renamed, firstId, "#dcfce7", settings, "2026-07-23T08:03:00.000Z");
  assert.equal(colored[0].color, "#dcfce7");

  const invalidColor = updateTodoColor(colored, firstId, "#000000", settings, "2026-07-23T08:04:00.000Z");
  assert.equal(invalidColor[0].color, "#dcfce7");

  const reminded = setTodoReminder(colored, firstId, "2026-07-23T09:00:00.000Z", "2026-07-23T08:05:00.000Z");
  assert.equal(reminded[0].reminderAt, "2026-07-23T09:00:00.000Z");
  assert.equal(reminded[0].reminded, false);

  const marked = markTodoReminded(reminded, firstId, "2026-07-23T09:00:10.000Z");
  assert.equal(marked[0].reminded, true);

  const cleared = clearTodoReminder(marked, firstId, "2026-07-23T09:01:00.000Z");
  assert.equal(cleared[0].reminderAt, "");
  assert.equal(cleared[0].reminded, false);

  const reordered = reorderTodoItems(cleared, firstId, secondId, "after");
  assert.deepEqual(reordered.map((item) => item.id), [secondId, firstId]);

  const deleted = deleteTodoItem(reordered, secondId);
  assert.deepEqual(deleted.map((item) => item.id), [firstId]);
});

test("completed data stores text, completedAt, and optional duration records", () => {
  const empty = createEmptyCompletedData();
  const data = appendCompletedRecord(empty, {
    text: "Task A",
    completedAt: "2026-07-23T09:30:00.000Z",
    durationMs: 1530000,
    color: "#fff"
  });

  assert.deepEqual(data, {
    version: 1,
    completed: [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z", durationMs: 1530000 }]
  });

  const normalized = normalizeCompletedData({
    version: "bad",
    completed: [
      { text: " Task B ", completedAt: "2026-07-24T10:00:00.000Z", color: "#fff", durationMs: -1 },
      { text: "", completedAt: "2026-07-24T11:00:00.000Z" }
    ]
  });
  assert.deepEqual(normalized, {
    version: 1,
    completed: [{ text: "Task B", completedAt: "2026-07-24T10:00:00.000Z" }]
  });
});

test("completed records are edited, deleted, and searched by text", () => {
  const data = {
    version: 1,
    completed: [
      { text: "Write spec", completedAt: "2026-07-23T09:00:00.000Z" },
      { text: "Review plan", completedAt: "2026-07-23T10:00:00.000Z" }
    ]
  };

  const edited = updateCompletedRecordText(data, 1, "Review implementation plan");
  assert.equal(edited.completed[1].text, "Review implementation plan");

  const results = searchCompletedRecords(edited, "implementation");
  assert.equal(results.length, 1);
  assert.equal(results[0].recordIndex, 1);

  const deleted = deleteCompletedRecord(edited, 0);
  assert.deepEqual(deleted.completed, [
    { text: "Review implementation plan", completedAt: "2026-07-23T10:00:00.000Z" }
  ]);
});
