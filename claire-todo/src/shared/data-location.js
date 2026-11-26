import {
  getCompletedFileStatus,
  mutateCompletedData as mutateLocalCompletedData,
} from "./completed-file-store.js";
import { appendCompletedRecord as appendRecord, deleteCompletedRecord, normalizeCompletedData, updateCompletedRecordText } from "./domain.js";

const DATA_LOCATION_KEY = "todoCompletedDataLocation";
const BROWSER_COMPLETED_KEY = "todoCompletedBrowserState";
const COMPLETED_META_KEY = "todoCompletedFileMeta";
const COMPLETED_CONFLICT_MESSAGE = "完成记录已在其他页面更新，请刷新后重试。";

// 返回当前文件授权状态，浏览器存储始终可作为默认保存位置。
export async function getCompletedStatus() {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  const status = await getCompletedFileStatus();
  const saved = (await chromeStorageGet(BROWSER_COMPLETED_KEY))[BROWSER_COMPLETED_KEY] || {};
  const fileKey = JSON.stringify([status.fileName, status.boundAt]);
  return {
    ...status,
    storage: status.permission === "granted" && saved.fileKey === fileKey && saved.storage === "file" ? "file" : "browser",
    fileSyncError: saved.fileSyncError || ""
  };
}

// 读取浏览器完成记录；可选文件同步由后台在事务结束后执行。
export async function readCompletedData() {
  return mutateCompletedData((data) => data);
}

// 保存完成记录到浏览器，文件写入失败不影响本地保存。
export async function writeCompletedData(data) {
  return mutateCompletedData(() => normalizeCompletedData(data));
}

// 追加完成记录，包含对应任务的独立计时时长。
export async function appendCompletedRecord(record) {
  return mutateCompletedData((data) => appendRecord(data, record));
}

// 更新浏览器中对应的完成记录，并尝试同步文件。
export async function updateCompletedRecord(recordIndex, text) {
  return mutateCompletedData((data) => updateCompletedRecordText(data, recordIndex, text));
}

// 删除浏览器中对应的完成记录，并尝试同步文件。
export async function deleteCompletedRecordAt(recordIndex, expectation) {
  return mutateCompletedData((data) => deleteCompletedRecord(data, recordIndex), { recordIndex, expectation });
}

// 控制事务只等待浏览器保存，文件授权、锁和磁盘读写不能占用待办队列。
async function mutateCompletedData(mutator, selection) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  try {
    const saved = (await chromeStorageGet(BROWSER_COMPLETED_KEY))[BROWSER_COMPLETED_KEY] || {};
    const currentData = normalizeCompletedData(saved.data);
    const revision = completedRevision(saved);
    if (selection && !matchesCompletedSelection(currentData, revision, selection)) {
      return failure("completed_conflict", COMPLETED_CONFLICT_MESSAGE);
    }
    const data = normalizeCompletedData(mutator(currentData));
    const nextRevision = revision + (completedDataEqual(currentData, data) ? 0 : 1);
    const state = {
      ...saved,
      data,
      revision: nextRevision,
      storage: "browser",
      fileSyncError: ""
    };
    await chromeStorageSet({ [BROWSER_COMPLETED_KEY]: state });
    return { ok: true, data: state.data, revision: nextRevision, storage: "browser" };
  } catch {
    return failure("browser_storage_error", "浏览器保存失败，任务已保留，请检查浏览器可用存储空间后重试");
  }
}

// 文件 IO 在队列外运行；合并和快照更新使用短事务，始终重读最新浏览器数据。
export async function syncCompletedData(runMutation) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  let fileKey = "";
  let writtenData;
  let fileResult;
  try {
    fileResult = await mutateLocalCompletedData(async (fileData) => {
      const status = await getCompletedFileStatus();
      fileKey = JSON.stringify([status.fileName, status.boundAt]);
      return runMutation(async () => {
        const saved = (await chromeStorageGet(BROWSER_COMPLETED_KEY))[BROWSER_COMPLETED_KEY] || {};
        // 上次 close 已成功但后台在标记前退出时，用写入意图确认真实基线。
        const pending = saved.pendingFileWrite;
        const recoveredWrite = pending?.fileKey === fileKey
          && JSON.stringify(normalizeCompletedData(pending.data)) === JSON.stringify(normalizeCompletedData(fileData));
        const base = recoveredWrite ? pending.data : saved.fileKey === fileKey ? saved.fileSnapshot : null;
        writtenData = mergeCompletedData(saved.data, fileData, base);
        await chromeStorageSet({
          [BROWSER_COMPLETED_KEY]: {
            ...saved,
            data: writtenData,
            revision: completedRevision(saved) + (completedDataEqual(saved.data, writtenData) ? 0 : 1),
            fileKey,
            fileSnapshot: normalizeCompletedData(fileData),
            pendingFileWrite: { fileKey, data: writtenData }
          }
        });
        return writtenData;
      });
    });
  } catch {
    fileResult = failure("file_unavailable", "JSON 文件暂不可用，记录已保存在浏览器中");
  }

  await runMutation(async () => {
    const values = await chromeStorageGet([BROWSER_COMPLETED_KEY, COMPLETED_META_KEY]);
    const saved = values[BROWSER_COMPLETED_KEY] || {};
    if (!saved.data) return;
    const meta = values[COMPLETED_META_KEY] || {};
    // 用户可能已经绑定另一个文件，旧同步不得更新新文件的状态或快照。
    if (fileKey && JSON.stringify([meta.fileName, meta.boundAt]) !== fileKey) return;
    const synced = fileResult.ok
      && JSON.stringify(normalizeCompletedData(saved.data)) === JSON.stringify(normalizeCompletedData(writtenData));
    if (fileResult.ok) delete saved.pendingFileWrite;
    await chromeStorageSet({
      [BROWSER_COMPLETED_KEY]: {
        ...saved,
        revision: completedRevision(saved),
        ...(fileResult.ok ? { fileKey, fileSnapshot: writtenData, fileName: fileResult.fileName } : {}),
        storage: synced ? "file" : "browser",
        fileSyncError: fileResult.ok ? "" : fileResult.reason
      }
    });
  });
  return fileResult;
}

function completedRevision(saved) {
  return Number.isSafeInteger(saved.revision) && saved.revision >= 0 ? saved.revision : 0;
}

function completedDataEqual(left, right) {
  return JSON.stringify(normalizeCompletedData(left)) === JSON.stringify(normalizeCompletedData(right));
}

function matchesCompletedSelection(data, revision, { recordIndex, expectation }) {
  const expectedRecord = expectation?.expectedRecord;
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || !data.completed[recordIndex]
    || !Number.isSafeInteger(expectation?.expectedRevision) || expectation.expectedRevision !== revision
    || !expectedRecord || typeof expectedRecord !== "object" || !expectedRecord.completedAt) return false;
  const expected = normalizeCompletedData({ completed: [expectedRecord] }).completed[0];
  return Boolean(expected) && JSON.stringify(data.completed[recordIndex]) === JSON.stringify(expected);
}

// 按记录出现次数合并两份历史；保留同名同时间的多条任务，并尊重离线删除。
function mergeCompletedData(browserData, fileData, snapshot) {
  const browser = normalizeCompletedData(browserData).completed;
  const file = normalizeCompletedData(fileData).completed;
  const base = normalizeCompletedData(snapshot).completed;
  const counts = new Map();
  for (const [index, records] of [base, browser, file].entries()) {
    for (const record of records) {
      const key = JSON.stringify([record.text, record.completedAt, record.durationMs || 0]);
      if (!counts.has(key)) counts.set(key, { record, values: [0, 0, 0] });
      counts.get(key).values[index] += 1;
    }
  }
  const completed = [];
  for (const { record, values: [before, local, remote] } of counts.values()) {
    const count = Math.min(before, local, remote) + Math.max(0, local - before, remote - before);
    for (let index = 0; index < count; index += 1) completed.push({ ...record });
  }
  return { version: 1, completed };
}

// 保留尚未实现的远端存储边界。
async function isRemoteMode() {
  const result = await chromeStorageGet(DATA_LOCATION_KEY);
  return result[DATA_LOCATION_KEY]?.mode === "remote";
}

function failure(reason, message) {
  return { ok: false, reason, message };
}

// 读取浏览器数据，确保读取失败不会被当作首次使用覆盖已有历史。
function chromeStorageGet(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const error = chrome.runtime?.lastError;
      if (error) reject(error);
      else resolve(result);
    });
  });
}

// 写入浏览器数据，只有保存成功后才允许完成任务。
function chromeStorageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime?.lastError;
      if (error) reject(error);
      else resolve();
    });
  });
}
