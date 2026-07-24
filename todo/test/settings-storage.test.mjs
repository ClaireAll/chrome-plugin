import test from "node:test";
import assert from "node:assert/strict";

test("settings sanitizes ball position and color presets", async () => {
  const { sanitizeSettings } = await import(`../src/shared/settings.js?test=${Date.now()}-sanitize`);
  const settings = sanitizeSettings({
    ballPosition: { left: 40, top: 50, snapped: true, side: "left" },
    colorPresets: ["#ffffff", "bad", "#dcfce7"],
    defaultColor: "#dcfce7"
  });

  assert.deepEqual(settings.ballPosition, { left: 40, top: 50, snapped: true, side: "left" });
  assert.deepEqual(settings.colorPresets, ["#ffffff", "#dcfce7"]);
  assert.equal(settings.defaultColor, "#dcfce7");
});

test("storage reads and writes normalized todo state through chrome.storage.local", async () => {
  const stub = createChromeStorage();
  globalThis.chrome = stub.chrome;
  const storage = await import(`../src/shared/storage.js?test=${Date.now()}-storage`);

  await storage.saveTodoItems([{ id: "a", text: " First ", color: "#fff" }]);
  const items = await storage.loadTodoItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].text, "First");
  assert.deepEqual(Object.keys(stub.values).sort(), ["todoUnfinishedItems"].sort());

  const state = await storage.loadTodoState();
  assert.equal(Array.isArray(state.items), true);
  assert.equal(Array.isArray(state.settings.colorPresets), true);
});

test("loadTodoItems rejects when storage get reports lastError", async () => {
  const error = { message: "storage get failed" };
  const stub = createChromeStorage({}, { get: error });
  globalThis.chrome = stub.chrome;
  const storage = await import(`../src/shared/storage.js?test=${Date.now()}-storage-get-error`);

  await assert.rejects(storage.loadTodoItems(), (reason) => reason === error);
});

test("saveTodoItems rejects when storage set reports lastError", async () => {
  const error = { message: "storage set failed" };
  const stub = createChromeStorage({}, { set: error });
  globalThis.chrome = stub.chrome;
  const storage = await import(`../src/shared/storage.js?test=${Date.now()}-storage-set-error`);

  await assert.rejects(storage.saveTodoItems([]), (reason) => reason === error);
});

function createChromeStorage(initial = {}, errors = {}) {
  const values = { ...initial };
  const runtime = { lastError: null };

  function withLastError(error, callback, value) {
    runtime.lastError = error ?? null;
    callback?.(value);
    runtime.lastError = null;
  }

  return {
    values,
    chrome: {
      runtime,
      storage: {
        local: {
          get(key, callback) {
            if (Array.isArray(key)) {
              withLastError(errors.get, callback, Object.fromEntries(key.map((name) => [name, values[name]])));
              return;
            }
            withLastError(errors.get, callback, { [key]: values[key] });
          },
          set(value, callback) {
            Object.assign(values, value);
            withLastError(errors.set, callback);
          }
        }
      }
    }
  };
}
