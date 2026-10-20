import {
  getCompletedFileStatus,
  mutateCompletedData as mutateLocalCompletedData,
} from "./completed-file-store.js";
import { appendCompletedRecord as appendRecord, deleteCompletedRecord, normalizeCompletedData, updateCompletedRecordText } from "./domain.js";

const DATA_LOCATION_KEY = "todoCompletedDataLocation";
const BROWSER_COMPLETED_KEY = "todoCompletedBrowserState";

// 返回当前文件授权状态，浏览器存储始终可作为默认保存位置。
export async function getCompletedStatus() {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  const status = await getCompletedFileStatus();
  return { ...status, storage: status.permission === "granted" ? "file" : "browser" };
}

// 读取浏览器完成记录，并在文件可用时合并及同步历史。
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
export async function deleteCompletedRecordAt(recordIndex) {
  return mutateCompletedData((data) => deleteCompletedRecord(data, recordIndex));
}

// 先持久化到浏览器，再在文件锁内合并历史，避免授权或磁盘错误阻断完成。
async function mutateCompletedData(mutator) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  try {
    const saved = (await chromeStorageGet(BROWSER_COMPLETED_KEY))[BROWSER_COMPLETED_KEY] || {};
    let state = { ...saved, data: normalizeCompletedData(mutator(normalizeCompletedData(saved.data))) };
    await chromeStorageSet({ [BROWSER_COMPLETED_KEY]: state });

    let fileKey = "";
    let fileResult;
    try {
      fileResult = await mutateLocalCompletedData(async (fileData) => {
        const status = await getCompletedFileStatus();
        fileKey = JSON.stringify([status.fileName, status.boundAt]);
        const base = state.fileKey === fileKey ? state.fileSnapshot : null;
        const data = mergeCompletedData(state.data, fileData, base);
        const mergedState = { ...state, data, fileKey, fileSnapshot: normalizeCompletedData(fileData) };
        await chromeStorageSet({ [BROWSER_COMPLETED_KEY]: mergedState });
        state = mergedState;
        return data;
      });
      if (fileResult.ok) {
        const syncedState = { ...state, fileKey, fileSnapshot: state.data };
        // 文件已落盘；快照标记失败时保留旧标记，后续合并仍可安全重试。
        await chromeStorageSet({ [BROWSER_COMPLETED_KEY]: syncedState }).catch(() => {});
      }
    } catch {
      fileResult = failure("file_unavailable", "JSON 文件暂不可用，记录已保存在浏览器中");
    }
    return {
      ok: true,
      data: state.data,
      storage: fileResult.ok ? "file" : "browser",
      ...(fileResult.ok ? { fileName: fileResult.fileName } : { fileSyncError: fileResult.reason })
    };
  } catch {
    return failure("browser_storage_error", "浏览器保存失败，任务已保留，请检查浏览器可用存储空间后重试");
  }
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
