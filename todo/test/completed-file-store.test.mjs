import test from "node:test";
import assert from "node:assert/strict";

test("completed file store creates and writes minimal completed JSON", async () => {
  const writes = [];
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async () => createHandle("completed.json", "", writes);
  globalThis.chrome = createChromeStorage().chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-create`);
  const createResult = await store.createCompletedJsonFile({ fileName: "todo-completed.json" });

  assert.equal(createResult.ok, true);
  assert.deepEqual(JSON.parse(writes.at(-1)), { version: 1, completed: [] });

  const appendResult = await store.appendCompletedRecordToFile("Task A", "2026-07-23T09:30:00.000Z");
  assert.equal(appendResult.ok, true);
  assert.deepEqual(JSON.parse(writes.at(-1)), {
    version: 1,
    completed: [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }]
  });
});

test("completed file store reports parse errors without overwriting bad JSON", async () => {
  const writes = [];
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showOpenFilePicker = async () => [createHandle("bad.json", "{bad", writes)];
  globalThis.chrome = createChromeStorage().chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-bad`);
  const result = await store.pickCompletedJsonFile();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "parse_error");
  assert.equal(writes.length, 0);
});

test("completed file store appends matching completed records from separate todos", async () => {
  const writes = [];
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async () => createHandle("completed.json", "", writes);
  globalThis.chrome = createChromeStorage().chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-duplicate-records`);
  await store.createCompletedJsonFile();
  await store.appendCompletedRecordToFile("Task A", "2026-07-23T09:30:00.000Z");
  await store.appendCompletedRecordToFile("Task A", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(JSON.parse(writes.at(-1)).completed, [
    { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" },
    { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }
  ]);
});

test("invalid selected JSON preserves an existing completed-file binding", async () => {
  const writes = [];
  const existing = createHandle("existing.json", "", writes);
  const invalid = createHandle("invalid.json", "{invalid", writes);
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async () => existing;
  globalThis.showOpenFilePicker = async () => [invalid];
  const chromeStorage = createChromeStorage();
  globalThis.chrome = chromeStorage.chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-invalid-picker`);
  await store.createCompletedJsonFile();
  const originalMeta = { ...chromeStorage.storage.todoCompletedFileMeta };

  const result = await store.pickCompletedJsonFile();

  assert.equal(result.reason, "parse_error");
  assert.equal((await store.getCompletedFileStatus()).fileName, "existing.json");
  assert.deepEqual(chromeStorage.storage.todoCompletedFileMeta, originalMeta);
});

test("failed completed-file creation preserves an existing binding", async () => {
  const writes = [];
  const existing = createHandle("existing.json", "", writes);
  const failing = createHandle("failing.json", "", writes, { writeError: new Error("disk full") });
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async () => existing;
  const chromeStorage = createChromeStorage();
  globalThis.chrome = chromeStorage.chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-failed-create`);
  await store.createCompletedJsonFile();
  const originalMeta = { ...chromeStorage.storage.todoCompletedFileMeta };
  globalThis.showSaveFilePicker = async () => failing;

  const result = await store.createCompletedJsonFile();

  assert.equal(result.reason, "write_error");
  assert.equal((await store.getCompletedFileStatus()).fileName, "existing.json");
  assert.deepEqual(chromeStorage.storage.todoCompletedFileMeta, originalMeta);
});

test("picked completed file must be writable before replacing an existing binding", async () => {
  const writes = [];
  const existing = createHandle("existing.json", "", writes);
  const readonlyCandidate = createHandle("readonly.json", "{\"version\":1,\"completed\":[]}", writes, {
    writeError: new Error("locked")
  });
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async () => existing;
  globalThis.showOpenFilePicker = async () => [readonlyCandidate];
  const chromeStorage = createChromeStorage();
  globalThis.chrome = chromeStorage.chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-readonly-picker`);
  await store.createCompletedJsonFile();
  const originalMeta = { ...chromeStorage.storage.todoCompletedFileMeta };

  const result = await store.pickCompletedJsonFile();

  assert.equal(result.reason, "write_error");
  assert.equal((await store.getCompletedFileStatus()).fileName, "existing.json");
  assert.deepEqual(chromeStorage.storage.todoCompletedFileMeta, originalMeta);
});

test("completed-file binding storage failure preserves the existing handle and metadata", async () => {
  const writes = [];
  const existing = createHandle("existing.json", "", writes);
  const candidate = createHandle("candidate.json", "", writes);
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async () => existing;
  const chromeStorage = createChromeStorage();
  globalThis.chrome = chromeStorage.chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-storage-failure`);
  await store.createCompletedJsonFile();
  const originalMeta = { ...chromeStorage.storage.todoCompletedFileMeta };
  chromeStorage.failSetWhen((value) => value.todoCompletedFileMeta?.fileName === "candidate.json");
  globalThis.showSaveFilePicker = async () => candidate;

  const result = await store.createCompletedJsonFile();

  assert.equal(result.reason, "bind_error");
  assert.equal((await store.getCompletedFileStatus()).fileName, "existing.json");
  assert.deepEqual(chromeStorage.storage.todoCompletedFileMeta, originalMeta);
});

function createHandle(name, initialText, writes, options = {}) {
  let text = initialText;
  return {
    name,
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
    async getFile() {
      return { async text() { return text; } };
    },
    async createWritable() {
      return {
        async write(nextText) {
          if (options.writeError) throw options.writeError;
          text = nextText;
          writes.push(nextText);
        },
        async close() {}
      };
    }
  };
}

function createChromeStorage(initial = {}) {
  const storage = { ...initial };
  let failSetWhen = () => false;
  const runtime = { lastError: null };
  return {
    storage,
    failSetWhen(callback) {
      failSetWhen = callback;
    },
    chrome: {
      runtime,
      storage: {
        local: {
          get(key, callback) {
            callback({ [key]: storage[key] });
          },
          set(value, callback) {
            if (failSetWhen(value)) {
              runtime.lastError = { message: "storage failed" };
              callback?.();
              runtime.lastError = null;
              return;
            }
            Object.assign(storage, value);
            callback?.();
          },
          remove(key, callback) {
            delete storage[key];
            callback?.();
          }
        }
      }
    }
  };
}

function createIndexedDbStub() {
  const storeValues = new Map();
  return {
    open() {
      const request = {};
      const db = {
        objectStoreNames: {
          contains() {
            return true;
          }
        },
        createObjectStore() {},
        transaction() {
          return {
            objectStore() {
              return {
                get(key) {
                  return asyncRequest(storeValues.get(key));
                },
                put(value, key) {
                  storeValues.set(key, value);
                  return asyncRequest(value);
                },
                delete(key) {
                  storeValues.delete(key);
                  return asyncRequest(undefined);
                }
              };
            }
          };
        }
      };
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    }
  };
}

function asyncRequest(result) {
  const request = {};
  queueMicrotask(() => {
    request.result = result;
    request.onsuccess?.();
  });
  return request;
}
