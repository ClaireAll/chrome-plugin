import {
  addPageToGroup,
  createEmptyData,
  createPageDraft,
  deletePage,
  incrementPageOpenCount,
  movePageToGroup,
  normalizeData,
  renamePage,
  reorderGroups,
  reorderPages,
  searchTree,
  setQuickAccessPinned
} from "../shared/domain.js";
import { getDataStatus, readGroupData, writeGroupData } from "../shared/data-store.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import { loadSettings, saveSettings } from "../shared/settings.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ groupInstalledAt: new Date().toISOString() });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        reason: "unexpected_error",
        message: error?.message || "操作失败"
      });
    });
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case MESSAGE_TYPES.GET_STATE:
      return getState(message?.query || "");
    case MESSAGE_TYPES.GET_PAGE_DRAFT:
      return getPageDraft(message?.payload, sender);
    case MESSAGE_TYPES.SAVE_CURRENT_PAGE:
      return saveCurrentPage(message?.payload);
    case MESSAGE_TYPES.OPEN_GROUP:
      return openGroup(message?.payload);
    case MESSAGE_TYPES.OPEN_PAGE:
      return openPage(message?.payload);
    case MESSAGE_TYPES.SET_QUICK_ACCESS_PIN:
      return setQuickAccessPin(message?.payload);
    case MESSAGE_TYPES.DELETE_PAGE:
      return deleteSavedPage(message?.payload);
    case MESSAGE_TYPES.RENAME_PAGE:
      return renameSavedPage(message?.payload);
    case MESSAGE_TYPES.REORDER_GROUPS:
      return reorderSavedGroups(message?.payload);
    case MESSAGE_TYPES.REORDER_PAGES:
      return reorderSavedPages(message?.payload);
    case MESSAGE_TYPES.MOVE_PAGE:
      return moveSavedPage(message?.payload);
    case MESSAGE_TYPES.OPEN_OPTIONS:
      chrome.runtime.openOptionsPage();
      return { ok: true };
    case MESSAGE_TYPES.UPDATE_DATA:
      return updateData(message?.payload?.data);
    case MESSAGE_TYPES.GET_SETTINGS:
      return { ok: true, settings: await loadSettings() };
    case MESSAGE_TYPES.UPDATE_SETTINGS:
      return { ok: true, settings: await saveSettings(message?.payload || {}) };
    default:
      return {
        ok: false,
        reason: "unknown_message",
        message: "未知操作"
      };
  }
}

async function getState(query = "") {
  const [readResult, fileStatus, settings] = await Promise.all([
    readGroupData(),
    getDataStatus(),
    loadSettings()
  ]);

  if (!readResult.ok) {
    return {
      ok: false,
      reason: readResult.reason,
      message: readResult.message,
      bound: fileStatus.bound,
      fileStatus,
      settings,
      data: createEmptyData(),
      tree: []
    };
  }

  const data = normalizeData(readResult.data);
  return {
    ok: true,
    bound: true,
    fileStatus,
    settings,
    data,
    tree: searchTree(data, query)
  };
}

function getPageDraft(payload, sender) {
  const url = payload?.url || sender?.tab?.url || "";
  const title = payload?.title || sender?.tab?.title || "";
  return { ok: true, draft: createPageDraft({ title, url }) };
}

async function saveCurrentPage(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const result = addPageToGroup(readResult.data, {
    groupName: payload?.groupName,
    pageTitle: payload?.pageTitle,
    url: payload?.url
  });

  if (result.status === "duplicate") {
    return {
      ok: true,
      status: "duplicate",
      existingGroupId: result.existingGroupId,
      existingGroupName: result.existingGroupName,
      page: result.page,
      data: result.data
    };
  }

  if (!["saved", "moved"].includes(result.status)) {
    return {
      ok: false,
      reason: "save_error",
      message: result.message || "保存失败"
    };
  }

  const writeResult = await writeGroupData(result.data);
  if (!writeResult.ok) return writeResult;
  await saveSettings({ recentGroupName: result.group.name });

  return {
    ok: true,
    status: result.status,
    previousGroupId: result.previousGroupId,
    previousGroupName: result.previousGroupName,
    group: result.group,
    page: result.page,
    data: result.data
  };
}

async function openGroup(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const data = normalizeData(readResult.data);
  const group = data.groups.find((item) => item.id === payload?.groupId || item.name === payload?.groupName);
  if (!group) {
    return { ok: false, reason: "missing_group", message: "分组不存在" };
  }

  const openedAt = new Date().toISOString();
  const nextData = group.pages.reduce(
    (current, page) => incrementPageOpenCount(current, page.id, openedAt),
    data
  );
  const writeResult = await writeGroupData(nextData);
  if (!writeResult.ok) return writeResult;

  for (const page of group.pages) {
    await chrome.tabs.create({ url: page.url, active: false });
  }

  return { ok: true, opened: group.pages.length, data: nextData };
}

async function openPage(payload) {
  const url = typeof payload === "string" ? payload : payload?.url;
  if (!url) return { ok: false, reason: "missing_url", message: "页面地址无效" };

  let data = null;
  if (payload?.pageId) {
    const readResult = await readGroupData();
    if (!readResult.ok) return readResult;
    data = incrementPageOpenCount(readResult.data, payload.pageId);
    const writeResult = await writeGroupData(data);
    if (!writeResult.ok) return writeResult;
  }

  await chrome.tabs.create({ url, active: false });
  return { ok: true, opened: 1, data };
}

async function setQuickAccessPin(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const data = setQuickAccessPinned(readResult.data, payload?.pageId, payload?.pinned);
  const writeResult = await writeGroupData(data);
  if (!writeResult.ok) return writeResult;

  return { ok: true, data };
}

async function deleteSavedPage(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const data = deletePage(readResult.data, payload?.pageId);
  const writeResult = await writeGroupData(data);
  if (!writeResult.ok) return writeResult;

  return { ok: true, data };
}

async function renameSavedPage(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const data = renamePage(readResult.data, payload?.pageId, payload?.name);
  const writeResult = await writeGroupData(data);
  if (!writeResult.ok) return writeResult;

  return { ok: true, data };
}

async function reorderSavedGroups(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const data = reorderGroups(readResult.data, payload?.sourceGroupId, payload?.targetGroupId, payload?.position);
  const writeResult = await writeGroupData(data);
  if (!writeResult.ok) return writeResult;

  return { ok: true, data };
}

async function reorderSavedPages(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const data = reorderPages(
    readResult.data,
    payload?.groupId,
    payload?.sourcePageId,
    payload?.targetPageId,
    payload?.position
  );
  const writeResult = await writeGroupData(data);
  if (!writeResult.ok) return writeResult;

  return { ok: true, data };
}

async function moveSavedPage(payload) {
  const readResult = await readGroupData();
  if (!readResult.ok) return readResult;

  const data = movePageToGroup(readResult.data, payload?.pageId, payload?.targetGroupId);
  const writeResult = await writeGroupData(data);
  if (!writeResult.ok) return writeResult;

  return { ok: true, data };
}

async function updateData(data) {
  const normalized = normalizeData(data);
  const writeResult = await writeGroupData(normalized);
  if (!writeResult.ok) return writeResult;
  return { ok: true, data: normalized };
}
