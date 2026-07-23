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

function createChromeStub() {
  const values = {};
  const runtime = { lastError: null, onMessage: { addListener() {} } };

  return {
    values,
    chrome: {
      runtime,
      alarms: {
        create() {},
        clear() {},
        onAlarm: { addListener() {} }
      },
      notifications: { onClicked: { addListener() {} } },
      storage: {
        local: {
          get(key, callback) {
            const result = Array.isArray(key)
              ? Object.fromEntries(key.map((name) => [name, values[name]]))
              : { [key]: values[key] };
            callback(result);
          },
          set(value, callback) {
            Object.assign(values, value);
            callback?.();
          }
        }
      }
    }
  };
}
