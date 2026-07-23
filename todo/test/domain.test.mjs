import test from "node:test";
import assert from "node:assert/strict";
import {
  addTodoItem,
  appendCompletedRecord,
  clearTodoReminder,
  createEmptyCompletedData,
  deleteCompletedRecord,
  deleteTodoItem,
  markTodoReminded,
  normalizeCompletedData,
  normalizeTodoItems,
  reorderTodoItems,
  searchCompletedRecords,
  setTodoReminder,
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

test("completed data stores only text and completedAt records", () => {
  const empty = createEmptyCompletedData();
  const data = appendCompletedRecord(empty, "Task A", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(data, {
    version: 1,
    completed: [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }]
  });

  const normalized = normalizeCompletedData({
    version: "bad",
    completed: [
      { text: " Task B ", completedAt: "2026-07-24T10:00:00.000Z", color: "#fff" },
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
