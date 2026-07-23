import test from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_TYPES } from "../src/shared/messages.js";

test("complete message appends completed JSON and removes unfinished todo", async () => {
  const chromeStub = createChromeStub();
  globalThis.chrome = chromeStub.chrome;
  const worker = await import(`../src/background/service-worker.js?test=${Date.now()}-complete`);

  chromeStub.values.todoUnfinishedItems = [{ id: "a", text: "Task A", color: "#fff" }];
  worker.__setCompletedStoreForTest({
    async appendCompletedRecord(record) {
      chromeStub.appended = record;
      return { ok: true, data: { version: 1, completed: [record] } };
    }
  });

  const result = await worker.handleMessage({
    type: MESSAGE_TYPES.COMPLETE_TODO,
    payload: { id: "a", completedAt: "2026-07-23T09:30:00.000Z" }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(chromeStub.appended, { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" });
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("complete message keeps unfinished todo until append resolves", async () => {
  const chromeStub = createChromeStub();
  globalThis.chrome = chromeStub.chrome;
  const worker = await import(`../src/background/service-worker.js?test=${Date.now()}-deferred`);

  chromeStub.values.todoUnfinishedItems = [{ id: "a", text: "Task A", color: "#fff" }];
  let resolveAppend;
  worker.__setCompletedStoreForTest({
    appendCompletedRecord() {
      return new Promise((resolve) => {
        resolveAppend = resolve;
      });
    }
  });

  const completion = worker.handleMessage({
    type: MESSAGE_TYPES.COMPLETE_TODO,
    payload: { id: "a", completedAt: "2026-07-23T09:30:00.000Z" }
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, [{ id: "a", text: "Task A", color: "#fff" }]);

  resolveAppend({ ok: true });
  const result = await completion;
  assert.equal(result.ok, true);
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});

test("complete message preserves unfinished todo when append fails", async () => {
  const chromeStub = createChromeStub();
  globalThis.chrome = chromeStub.chrome;
  const worker = await import(`../src/background/service-worker.js?test=${Date.now()}-append-failure`);

  const todo = { id: "a", text: "Task A", color: "#fff" };
  chromeStub.values.todoUnfinishedItems = [todo];
  worker.__setCompletedStoreForTest({
    async appendCompletedRecord() {
      return { ok: false, reason: "write_failed", message: "Could not write completed file" };
    }
  });

  const result = await worker.handleMessage({
    type: MESSAGE_TYPES.COMPLETE_TODO,
    payload: { id: "a", completedAt: "2026-07-23T09:30:00.000Z" }
  });

  assert.deepEqual(result, { ok: false, reason: "write_failed", message: "Could not write completed file" });
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, [todo]);
  assert.equal(chromeStub.clearCalls, 0);
});

test("late alarm marks todo without creating a notification", async () => {
  const chromeStub = createChromeStub();
  globalThis.chrome = chromeStub.chrome;
  const worker = await import(`../src/background/service-worker.js?test=${Date.now()}-late-alarm`);

  chromeStub.values.todoUnfinishedItems = [{
    id: "a",
    text: "Task A",
    color: "#fff",
    reminderAt: "2026-07-23T09:00:00.000Z",
    reminded: false
  }];

  await worker.handleAlarm(
    { name: "todo-reminder:a" },
    "2026-07-23T09:02:01.000Z"
  );

  assert.equal(chromeStub.values.todoUnfinishedItems[0].reminded, true);
  assert.equal(chromeStub.notificationCalls, 0);
});

test("on-time alarm creates a notification with the packaged icon", async () => {
  const chromeStub = createChromeStub();
  globalThis.chrome = chromeStub.chrome;
  const worker = await import(`../src/background/service-worker.js?test=${Date.now()}-on-time-alarm`);

  chromeStub.values.todoUnfinishedItems = [{
    id: "a",
    text: "Task A",
    color: "#fff",
    reminderAt: "2026-07-23T09:00:00.000Z",
    reminded: false
  }];

  await worker.handleAlarm(
    { name: "todo-reminder:a" },
    "2026-07-23T09:01:00.000Z"
  );

  assert.deepEqual(chromeStub.notificationPayload, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Todo reminder",
    message: "Task A"
  });
});

test("notification click handler has no alarm, storage, runtime, or notification side effects", async () => {
  const chromeStub = createChromeStub();
  globalThis.chrome = chromeStub.chrome;
  await import(`../src/background/service-worker.js?test=${Date.now()}-notification-click`);

  assert.equal(typeof chromeStub.notificationClick, "function");
  assert.doesNotThrow(() => chromeStub.notificationClick("todo-reminder:a"));
  assert.equal(chromeStub.alarmCreateCalls, 0);
  assert.equal(chromeStub.clearCalls, 0);
  assert.equal(chromeStub.storageGetCalls, 0);
  assert.equal(chromeStub.storageSetCalls, 0);
  assert.equal(chromeStub.runtimeOpenOptionsCalls, 0);
  assert.equal(chromeStub.notificationCalls, 0);
});

function createChromeStub() {
  const values = {};
  let notificationClick;
  const runtime = {
    lastError: null,
    onMessage: { addListener() {} },
    openOptionsPage() {
      stub._runtimeOpenOptionsCalls = (stub._runtimeOpenOptionsCalls || 0) + 1;
    }
  };
  const stub = { values };

  stub.chrome = {
    runtime,
    alarms: {
      create() {
        stub._alarmCreateCalls = (stub._alarmCreateCalls || 0) + 1;
      },
      clear() {
        stub._clearCalls = (stub._clearCalls || 0) + 1;
      },
      onAlarm: { addListener() {} }
    },
    notifications: {
      create(_id, payload) {
        stub._notificationCalls = (stub._notificationCalls || 0) + 1;
        stub._notificationPayload = payload;
      },
      onClicked: {
        addListener(callback) {
          notificationClick = callback;
        }
      }
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
          Object.assign(values, value);
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
