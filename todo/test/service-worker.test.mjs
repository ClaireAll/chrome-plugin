import test from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_TYPES } from "../src/shared/messages.js";

test("complete message appends completed JSON and removes unfinished todo", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("complete");
  chromeStub.values.todoUnfinishedItems = [{ id: "a", text: "Task A", color: "#fff" }];
  worker.__setCompletedStoreForTest({ async appendCompletedRecord(record) {
    chromeStub.appended = record;
    return { ok: true };
  } });

  const result = await complete(worker, "a", "2026-07-23T09:30:00.000Z");

  assert.equal(result.ok, true);
  assert.deepEqual(chromeStub.appended, { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" });
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("worker serializes deferred completions so both completed records persist", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("concurrent-complete");
  chromeStub.values.todoUnfinishedItems = [
    { id: "a", text: "Task A", color: "#fff" },
    { id: "b", text: "Task B", color: "#fff" }
  ];
  const appended = [];
  let resolveFirstAppend;
  worker.__setCompletedStoreForTest({
    appendCompletedRecord(record) {
      appended.push(record);
      return appended.length === 1
        ? new Promise((resolve) => { resolveFirstAppend = resolve; })
        : Promise.resolve({ ok: true });
    }
  });

  const first = complete(worker, "a", "2026-07-23T09:30:00.000Z");
  const second = complete(worker, "b", "2026-07-23T09:31:00.000Z");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(appended, [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }]);

  resolveFirstAppend({ ok: true });
  await Promise.all([first, second]);
  assert.deepEqual(appended, [
    { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" },
    { text: "Task B", completedAt: "2026-07-23T09:31:00.000Z" }
  ]);
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("completion retry reuses its durable appended receipt after local removal fails", async (t) => {
  let failedRemoval = false;
  const chromeStub = installChromeStub(t, {
    storageSetError(value) {
      if (!failedRemoval && Array.isArray(value.todoUnfinishedItems) && value.todoUnfinishedItems.length === 0) {
        failedRemoval = true;
        return { message: "local removal failed" };
      }
      return null;
    }
  });
  const worker = await importWorker("completion-retry");
  chromeStub.values.todoUnfinishedItems = [{ id: "a", text: "Task A", color: "#fff" }];
  const appended = [];
  worker.__setCompletedStoreForTest({ async appendCompletedRecord(record) {
    appended.push(record);
    return { ok: true };
  } });

  await assert.rejects(complete(worker, "a", "2026-07-23T09:30:00.000Z"));
  await complete(worker, "a", "2026-07-23T10:00:00.000Z");

  assert.deepEqual(appended, [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }]);
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("completion retry does not duplicate JSON after appended receipt persistence fails", async (t) => {
  let failedReceiptSave = false;
  const chromeStub = installChromeStub(t, {
    storageSetError(value) {
      if (!failedReceiptSave && value.todoUnfinishedItems?.[0]?.completionReceipt?.appended === true) {
        failedReceiptSave = true;
        return { message: "receipt save failed" };
      }
      return null;
    }
  });
  const worker = await importWorker("completion-appended-receipt-failure");
  chromeStub.values.todoUnfinishedItems = [{ id: "a", text: "Task A", color: "#fff" }];
  const completed = [];
  worker.__setCompletedStoreForTest({
    async readCompletedData() {
      return { ok: true, data: { version: 1, completed: [...completed] } };
    },
    async appendCompletedRecord(record) {
      completed.push(record);
      return { ok: true };
    }
  });

  await assert.rejects(complete(worker, "a", "2026-07-23T09:30:00.000Z"));
  await complete(worker, "a", "2026-07-23T10:00:00.000Z");

  assert.deepEqual(completed, [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }]);
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("completion retry appends when another todo already had the same text and completion time", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("completion-count-retry");
  const completed = [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }];
  chromeStub.values.todoUnfinishedItems = [{
    id: "b",
    text: "Task A",
    color: "#fff",
    completionReceipt: {
      text: "Task A",
      completedAt: "2026-07-23T09:30:00.000Z",
      appendStarted: true,
      appended: false,
      matchingCountBefore: 1
    }
  }];
  worker.__setCompletedStoreForTest({
    async readCompletedData() {
      return { ok: true, data: { version: 1, completed: [...completed] } };
    },
    async appendCompletedRecord(record) {
      completed.push(record);
      return { ok: true };
    }
  });

  await complete(worker, "b", "2026-07-23T10:00:00.000Z");

  assert.deepEqual(completed, [
    { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" },
    { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }
  ]);
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("completion retry uses the original receipt text snapshot", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("completion-text-snapshot");
  const completed = [];
  chromeStub.values.todoUnfinishedItems = [{
    id: "a",
    text: "Edited text",
    color: "#fff",
    completionReceipt: {
      text: "Original text",
      completedAt: "2026-07-23T09:30:00.000Z",
      appendStarted: true,
      appended: false,
      matchingCountBefore: 0
    }
  }];
  worker.__setCompletedStoreForTest({
    async readCompletedData() {
      return { ok: true, data: { version: 1, completed: [...completed] } };
    },
    async appendCompletedRecord(record) {
      completed.push(record);
      return { ok: true };
    }
  });

  await complete(worker, "a", "2026-07-23T10:00:00.000Z");

  assert.deepEqual(completed, [{ text: "Original text", completedAt: "2026-07-23T09:30:00.000Z" }]);
});

test("completion recovers an older same-signature pending receipt before completing a new todo", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("completion-pending-owner");
  const completed = [];
  chromeStub.values.todoUnfinishedItems = [
    {
      id: "a",
      text: "Task A",
      color: "#fff",
      completionReceipt: {
        text: "Task A",
        completedAt: "2026-07-23T09:30:00.000Z",
        appendStarted: true,
        appended: false,
        matchingCountBefore: 0
      }
    },
    { id: "b", text: "Task A", color: "#fff" }
  ];
  worker.__setCompletedStoreForTest({
    async readCompletedData() {
      return { ok: true, data: { version: 1, completed: [...completed] } };
    },
    async appendCompletedRecord(record) {
      completed.push(record);
      return { ok: true };
    }
  });

  await complete(worker, "b", "2026-07-23T09:30:00.000Z");
  await complete(worker, "a", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(completed, [
    { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" },
    { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }
  ]);
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("complete message preserves unfinished todo when append fails", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("append-failure");
  const todo = { id: "a", text: "Task A", color: "#fff" };
  chromeStub.values.todoUnfinishedItems = [todo];
  worker.__setCompletedStoreForTest({ async appendCompletedRecord() {
    return { ok: false, reason: "write_failed", message: "Could not write completed file" };
  } });

  const result = await complete(worker, "a", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(result, { ok: false, reason: "write_failed", message: "Could not write completed file" });
  assert.equal(chromeStub.values.todoUnfinishedItems.length, 1);
  assert.equal(chromeStub.clearCalls, 0);
});

test("late alarms mark the todo reminded without creating a notification", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("late-alarm");
  chromeStub.values.todoUnfinishedItems = [reminderTodo()];

  await worker.handleAlarm(matchingAlarm(), "2026-07-23T09:02:01.000Z");

  assert.equal(chromeStub.values.todoUnfinishedItems[0].reminded, true);
  assert.equal(chromeStub.notificationCalls, 0);
});

test("early alarms leave the todo eligible for the matching future alarm", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("early-alarm");
  chromeStub.values.todoUnfinishedItems = [reminderTodo()];

  await worker.handleAlarm(matchingAlarm(), "2026-07-23T08:59:59.000Z");

  assert.equal(chromeStub.values.todoUnfinishedItems[0].reminded, false);
  assert.equal(chromeStub.notificationCalls, 0);
});

test("mismatched alarms do not notify or mark the current reminder", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("mismatched-alarm");
  chromeStub.values.todoUnfinishedItems = [reminderTodo()];

  await worker.handleAlarm({ name: "todo-reminder:a", scheduledTime: Date.parse("2026-07-23T09:05:00.000Z") }, "2026-07-23T09:00:01.000Z");

  assert.equal(chromeStub.notificationCalls, 0);
  assert.equal(chromeStub.values.todoUnfinishedItems[0].reminded, false);
});

test("notification failures leave the reminder eligible for retry", async (t) => {
  const chromeStub = installChromeStub(t, { notificationError: new Error("notifications unavailable") });
  const worker = await importWorker("notification-failure");
  chromeStub.values.todoUnfinishedItems = [reminderTodo()];

  await assert.rejects(worker.handleAlarm(matchingAlarm(), "2026-07-23T09:00:01.000Z"));

  assert.equal(chromeStub.values.todoUnfinishedItems[0].reminded, false);
});

test("on-time alarm creates a notification before marking the todo reminded", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("on-time-alarm");
  chromeStub.values.todoUnfinishedItems = [reminderTodo()];

  await worker.handleAlarm(matchingAlarm(), "2026-07-23T09:01:00.000Z");

  assert.deepEqual(chromeStub.notificationPayload, {
    type: "basic", iconUrl: "icons/icon-128.png", title: "Todo reminder", message: "Task A"
  });
  assert.equal(chromeStub.values.todoUnfinishedItems[0].reminded, true);
  assert.ok(chromeStub.events.indexOf("notification") < chromeStub.events.lastIndexOf("save"));
});

test("alarm serialization preserves a todo added while its notification is pending", async (t) => {
  let releaseNotification;
  let notificationReleased = false;
  const release = () => {
    if (notificationReleased) return;
    notificationReleased = true;
    releaseNotification();
  };
  const chromeStub = installChromeStub(t, {
    createNotification: () => new Promise((resolve) => { releaseNotification = resolve; }),
    onStorageSet(value) {
      if (value.todoUnfinishedItems?.some((item) => item.text === "Task B")) release();
    }
  });
  const worker = await importWorker("alarm-add-race");
  chromeStub.values.todoUnfinishedItems = [reminderTodo()];

  const alarm = worker.handleAlarm(matchingAlarm(), "2026-07-23T09:00:01.000Z");
  await new Promise((resolve) => setImmediate(resolve));
  const add = worker.handleMessage({ type: MESSAGE_TYPES.ADD_TODO, payload: { text: "Task B" } });

  setTimeout(release, 20);
  await Promise.all([alarm, add]);

  assert.deepEqual(chromeStub.values.todoUnfinishedItems.map((item) => item.text), ["Task A", "Task B"]);
  assert.equal(chromeStub.values.todoUnfinishedItems[0].reminded, true);
});

test("simultaneous valid alarms mark both matching todos reminded", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("simultaneous-alarms");
  chromeStub.values.todoUnfinishedItems = [
    reminderTodo("a", "Task A"),
    reminderTodo("b", "Task B")
  ];

  await Promise.all([
    worker.handleAlarm(matchingAlarm("a"), "2026-07-23T09:00:01.000Z"),
    worker.handleAlarm(matchingAlarm("b"), "2026-07-23T09:00:01.000Z")
  ]);

  assert.deepEqual(chromeStub.values.todoUnfinishedItems.map((item) => item.reminded), [true, true]);
});

test("reminder persistence completes before its alarm is scheduled", async (t) => {
  const chromeStub = installChromeStub(t);
  const worker = await importWorker("reminder-order");
  chromeStub.values.todoUnfinishedItems = [{ id: "a", text: "Task A", color: "#fff" }];

  await worker.handleMessage({
    type: MESSAGE_TYPES.UPDATE_TODO_REMINDER,
    payload: { id: "a", reminderAt: "2026-07-23T09:00:00.000Z" }
  });

  assert.ok(chromeStub.events.indexOf("save") < chromeStub.events.indexOf("alarm"));
});

test("notification click handler has no alarm, storage, runtime, or notification side effects", async (t) => {
  const chromeStub = installChromeStub(t);
  await importWorker("notification-click");

  assert.equal(typeof chromeStub.notificationClick, "function");
  assert.doesNotThrow(() => chromeStub.notificationClick("todo-reminder:a"));
  assert.equal(chromeStub.alarmCreateCalls, 0);
  assert.equal(chromeStub.clearCalls, 0);
  assert.equal(chromeStub.storageGetCalls, 0);
  assert.equal(chromeStub.storageSetCalls, 0);
  assert.equal(chromeStub.runtimeOpenOptionsCalls, 0);
  assert.equal(chromeStub.notificationCalls, 0);
});

function complete(worker, id, completedAt) {
  return worker.handleMessage({ type: MESSAGE_TYPES.COMPLETE_TODO, payload: { id, completedAt } });
}

function reminderTodo(id = "a", text = "Task A") {
  return { id, text, color: "#fff", reminderAt: "2026-07-23T09:00:00.000Z", reminded: false };
}

function matchingAlarm(id = "a") {
  return { name: `todo-reminder:${id}`, scheduledTime: Date.parse("2026-07-23T09:00:00.000Z") };
}

function importWorker(name) {
  return import(`../src/background/service-worker.js?test=${Date.now()}-${name}`);
}

function installChromeStub(t, options) {
  const previousChrome = globalThis.chrome;
  const stub = createChromeStub(options);
  globalThis.chrome = stub.chrome;
  t.after(() => { globalThis.chrome = previousChrome; });
  return stub;
}

function createChromeStub(options = {}) {
  const values = {};
  const stub = { values, events: [] };
  let notificationClick;
  const runtime = {
    lastError: null,
    onMessage: { addListener() {} },
    openOptionsPage() { stub._runtimeOpenOptionsCalls = (stub._runtimeOpenOptionsCalls || 0) + 1; }
  };
  stub.chrome = {
    runtime,
    alarms: {
      create() { stub._alarmCreateCalls = (stub._alarmCreateCalls || 0) + 1; stub.events.push("alarm"); },
      clear() { stub._clearCalls = (stub._clearCalls || 0) + 1; },
      onAlarm: { addListener() {} }
    },
    notifications: {
      create(_id, payload) {
        stub._notificationCalls = (stub._notificationCalls || 0) + 1;
        stub._notificationPayload = payload;
        stub.events.push("notification");
        if (options.notificationError) throw options.notificationError;
        return options.createNotification?.();
      },
      onClicked: { addListener(callback) { notificationClick = callback; } }
    },
    storage: {
      local: {
        get(key, callback) {
          stub._storageGetCalls = (stub._storageGetCalls || 0) + 1;
          const result = Array.isArray(key)
            ? Object.fromEntries(key.map((name) => [name, values[name]]))
            : { [key]: values[key] };
          callback(result);
        },
        set(value, callback) {
          stub._storageSetCalls = (stub._storageSetCalls || 0) + 1;
          stub.events.push("save");
          const error = options.storageSetError?.(value) || options.storageSetErrors?.[stub._storageSetCalls];
          if (error) {
            runtime.lastError = error;
            callback?.();
            runtime.lastError = null;
            return;
          }
          Object.assign(values, value);
          options.onStorageSet?.(value);
          callback?.();
        }
      }
    }
  };
  Object.defineProperties(stub, {
    alarmCreateCalls: { get: () => stub._alarmCreateCalls || 0 },
    clearCalls: { get: () => stub._clearCalls || 0 },
    notificationCalls: { get: () => stub._notificationCalls || 0 },
    notificationClick: { get: () => notificationClick },
    notificationPayload: { get: () => stub._notificationPayload },
    runtimeOpenOptionsCalls: { get: () => stub._runtimeOpenOptionsCalls || 0 },
    storageGetCalls: { get: () => stub._storageGetCalls || 0 },
    storageSetCalls: { get: () => stub._storageSetCalls || 0 }
  });
  return stub;
}
