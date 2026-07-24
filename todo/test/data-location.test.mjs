import test from "node:test";
import assert from "node:assert/strict";

test("data location exposes unsupported remote boundary without using it", async () => {
  globalThis.chrome = createChromeStorage({ todoCompletedDataLocation: { mode: "remote" } }).chrome;
  const store = await import(`../src/shared/data-location.js?test=${Date.now()}-remote`);

  const result = await store.readCompletedData();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported_remote");
});

function createChromeStorage(initial = {}) {
  const storage = { ...initial };
  return {
    storage,
    chrome: {
      storage: {
        local: {
          get(key, callback) {
            callback({ [key]: storage[key] });
          },
          set(value, callback) {
            Object.assign(storage, value);
            callback?.();
          }
        }
      }
    }
  };
}
