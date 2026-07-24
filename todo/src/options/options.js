import { buildEChartsHeatmapOption, buildWeeklySummary } from "../shared/weekly-summary.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import {
  createCompletedJsonFile,
  pickCompletedJsonFile,
  requestCompletedFilePermission
} from "../shared/completed-file-store.js";

const elements = {
  addColorPreset: document.getElementById("addColorPreset"),
  colorPresetList: document.getElementById("colorPresetList"),
  completedFileStatus: document.getElementById("completedFileStatus"),
  completedList: document.getElementById("completedList"),
  completedSearch: document.getElementById("completedSearch"),
  createCompletedFile: document.getElementById("createCompletedFile"),
  pickCompletedFile: document.getElementById("pickCompletedFile"),
  requestCompletedPermission: document.getElementById("requestCompletedPermission"),
  weeklyChart: document.getElementById("weeklyChart")
};

const COLOR_PICKER_OPTIONS = ["#2563eb", "#14b8a6", "#f97316", "#8b5cf6", "#ef4444", "#facc15", "#ffffff"];
let completedData = { completed: [] };
let completedStatus = null;
let completedMutationBusy = false;
let settings = { colorPresets: [] };
let activeColorPreset = "";
let chart = null;

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function renderCompletedRecords() {
  const query = elements.completedSearch.value.trim().toLowerCase();
  const records = (completedData.completed || [])
    .map((record, recordIndex) => ({ ...record, recordIndex }))
    .filter((record) => record.text.toLowerCase().includes(query))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
  elements.completedList.replaceChildren();

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "没有匹配的完成记录";
    elements.completedList.append(empty);
    return;
  }

  for (const record of records) {
    const row = document.createElement("div");
    row.className = "completed-row";
    const input = document.createElement("input");
    input.value = record.text;
    input.setAttribute("aria-label", "完成任务文本");
    input.disabled = completedMutationBusy;
    input.addEventListener("change", async () => {
      await handleCompletedMutation(
        () => sendMessage(MESSAGE_TYPES.UPDATE_COMPLETED_RECORD, { recordIndex: record.recordIndex, text: input.value }),
        "完成记录保存失败"
      );
    });
    const time = document.createElement("time");
    time.className = "completed-time";
    time.dateTime = record.completedAt;
    time.textContent = new Date(record.completedAt).toLocaleString();
    const deleteButton = createButton("删除", "icon-button", async () => {
      await handleCompletedMutation(
        () => sendMessage(MESSAGE_TYPES.DELETE_COMPLETED_RECORD, { recordIndex: record.recordIndex }),
        "完成记录删除失败"
      );
    });
    deleteButton.disabled = completedMutationBusy;
    row.append(input, time, deleteButton);
    elements.completedList.append(row);
  }
}

function renderColorPresets() {
  elements.colorPresetList.replaceChildren();
  for (const color of settings.colorPresets || []) {
    const item = document.createElement("div");
    item.className = "color-preset-item";
    const swatch = createButton("", "color-swatch", () => toggleColorPicker(color));
    swatch.style.backgroundColor = color;
    swatch.title = `编辑 ${color}`;
    swatch.setAttribute("aria-label", `编辑颜色 ${color}`);
    swatch.setAttribute("aria-expanded", activeColorPreset === color ? "true" : "false");
    item.append(swatch, createButton("删除", "icon-button", () => deleteColorPreset(color)));
    if (activeColorPreset === color) item.append(renderColorPickerMenu(color));
    elements.colorPresetList.append(item);
  }
}

async function updateColorPresets(colorPresets) {
  const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { colorPresets });
  if (!result.ok) return;
  settings = result.settings || { ...settings, colorPresets };
  renderColorPresets();
}

function toggleColorPicker(color) {
  activeColorPreset = activeColorPreset === color ? "" : color;
  renderColorPresets();
}

function renderColorPickerMenu(color) {
  const menu = document.createElement("div");
  menu.className = "color-picker-menu";
  menu.setAttribute("role", "menu");
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "color-picker-input";
  picker.value = normalizePickerColor(color);
  picker.setAttribute("aria-label", "选择颜色");
  picker.addEventListener("change", () => applyColorPreset(color, picker.value));
  const choices = document.createElement("div");
  choices.className = "color-picker-choices";
  for (const choice of COLOR_PICKER_OPTIONS) {
    const button = createButton("", "color-picker-choice", () => applyColorPreset(color, choice));
    button.style.backgroundColor = choice;
    button.title = choice;
    button.setAttribute("aria-label", `选择 ${choice}`);
    choices.append(button);
  }
  menu.append(picker, choices);
  return menu;
}

function applyColorPreset(color, nextColor) {
  const normalizedColor = normalizePickerColor(nextColor);
  if (normalizedColor === color) return;
  activeColorPreset = "";
  updateColorPresets(settings.colorPresets.map((item) => item === color ? normalizedColor : item));
}

function deleteColorPreset(color) {
  if (activeColorPreset === color) activeColorPreset = "";
  updateColorPresets(settings.colorPresets.filter((item) => item !== color));
}

function normalizePickerColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color.toLowerCase() : "#ffffff";
}

function renderWeeklySummary() {
  const summary = buildWeeklySummary(completedData.completed);
  elements.weeklyChart.style.height = `${summary.chartHeight}px`;
  if (!globalThis.echarts) {
    elements.weeklyChart.textContent = "图表组件不可用";
    return;
  }
  chart ||= globalThis.echarts.init(elements.weeklyChart);
  chart.setOption(buildEChartsHeatmapOption(summary), true);
  chart.resize();
}

async function refreshCompletedData(statusOverride = "") {
  const result = await sendMessage(MESSAGE_TYPES.READ_COMPLETED_DATA).catch((error) => ({
    ok: false,
    message: error?.message || "无法读取完成记录文件"
  }));
  if (!result.ok) {
    elements.completedFileStatus.textContent = statusOverride || completedFileErrorText(result.message || "未绑定完成记录文件");
  } else {
    applyCompletedData(result.data);
    elements.completedFileStatus.textContent = statusOverride || completedFileStatusText(result.fileName);
    return;
  }
  renderCompletedRecords();
  renderWeeklySummary();
}

async function handleCompletedMutation(operation, fallbackMessage) {
  if (completedMutationBusy) return;
  completedMutationBusy = true;
  renderCompletedRecords();
  try {
    const result = await operation();
    if (result?.ok) {
      await refreshCompletedData();
      return;
    }
    await refreshCompletedData(result?.message || fallbackMessage);
  } catch (error) {
    await refreshCompletedData(error?.message || fallbackMessage);
  } finally {
    completedMutationBusy = false;
    renderCompletedRecords();
  }
}

async function showCompletedFileResult(result) {
  if (result.ok) {
    applyCompletedStatus(result);
    if (result.data) applyCompletedData(result.data);
    await refreshCompletedData();
    return;
  }
  elements.completedFileStatus.textContent = result.message || "Completed JSON file operation failed";
}

async function refreshState() {
  const state = await sendMessage(MESSAGE_TYPES.GET_STATE).catch(() => ({ ok: false }));
  if (state.ok) {
    settings = state.settings;
    applyCompletedStatus(state.completedStatus);
  }
  renderColorPresets();
  await refreshCompletedData();
}

function applyCompletedStatus(status) {
  if (!status?.fileName) return;
  completedStatus = {
    fileName: status.fileName,
    permission: status.permission || completedStatus?.permission || ""
  };
  elements.completedFileStatus.textContent = completedFileStatusText(completedStatus.fileName);
}

function applyCompletedData(data) {
  completedData = data && Array.isArray(data.completed) ? data : { completed: [] };
  renderCompletedRecords();
  renderWeeklySummary();
}

function completedFileStatusText(fileName) {
  const name = fileName || completedStatus?.fileName;
  if (!name) return "";
  return completedStatus?.permission && completedStatus.fileName === name
    ? `${name} (${completedStatus.permission})`
    : name;
}

function completedFileErrorText(message) {
  const status = completedFileStatusText();
  return status ? `${status} - ${message}` : message;
}

elements.completedSearch.addEventListener("input", renderCompletedRecords);
elements.pickCompletedFile.addEventListener("click", async () => {
  const result = await pickCompletedJsonFile();
  await showCompletedFileResult(result);
});
elements.createCompletedFile.addEventListener("click", async () => {
  const result = await createCompletedJsonFile();
  await showCompletedFileResult(result);
});
elements.requestCompletedPermission.addEventListener("click", async () => {
  const result = await requestCompletedFilePermission();
  if (result.ok) {
    applyCompletedStatus(result);
    await refreshCompletedData();
  }
  else elements.completedFileStatus.textContent = result.message;
});
elements.addColorPreset.addEventListener("click", () => {
  const color = globalThis.prompt("颜色值", "#ffffff");
  if (color) updateColorPresets([...(settings.colorPresets || []), color]);
});
globalThis.addEventListener("resize", () => chart?.resize());

refreshState();
