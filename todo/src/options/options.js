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

let completedData = { completed: [] };
let settings = { colorPresets: [] };
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
    input.addEventListener("change", async () => {
      const result = await sendMessage(MESSAGE_TYPES.UPDATE_COMPLETED_RECORD, { recordIndex: record.recordIndex, text: input.value });
      if (result.ok) await refreshCompletedData();
    });
    const time = document.createElement("time");
    time.className = "completed-time";
    time.dateTime = record.completedAt;
    time.textContent = new Date(record.completedAt).toLocaleString();
    row.append(input, time, createButton("删除", "icon-button", async () => {
      const result = await sendMessage(MESSAGE_TYPES.DELETE_COMPLETED_RECORD, { recordIndex: record.recordIndex });
      if (result.ok) await refreshCompletedData();
    }));
    elements.completedList.append(row);
  }
}

function renderColorPresets() {
  elements.colorPresetList.replaceChildren();
  for (const color of settings.colorPresets || []) {
    const item = document.createElement("div");
    item.className = "color-preset-item";
    const swatch = createButton("", "color-swatch", () => editColorPreset(color));
    swatch.style.backgroundColor = color;
    swatch.title = `编辑 ${color}`;
    item.append(swatch, createButton("删除", "icon-button", () => deleteColorPreset(color)));
    elements.colorPresetList.append(item);
  }
}

async function updateColorPresets(colorPresets) {
  const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { ...settings, colorPresets });
  if (!result.ok) return;
  settings = result.settings;
  renderColorPresets();
}

function editColorPreset(color) {
  const nextColor = globalThis.prompt("颜色值", color);
  if (!nextColor || nextColor === color) return;
  updateColorPresets(settings.colorPresets.map((item) => item === color ? nextColor : item));
}

function deleteColorPreset(color) {
  updateColorPresets(settings.colorPresets.filter((item) => item !== color));
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

async function refreshCompletedData() {
  const result = await sendMessage(MESSAGE_TYPES.READ_COMPLETED_DATA);
  if (!result.ok) {
    completedData = { completed: [] };
    elements.completedFileStatus.textContent = result.message || "未绑定完成记录文件";
  } else {
    completedData = result.data;
    elements.completedFileStatus.textContent = result.fileName || "已加载完成记录文件";
  }
  renderCompletedRecords();
  renderWeeklySummary();
}

async function showCompletedFileResult(result) {
  if (result.ok) {
    await refreshCompletedData();
    return;
  }
  elements.completedFileStatus.textContent = result.message || "Completed JSON file operation failed";
}

async function refreshState() {
  const state = await sendMessage(MESSAGE_TYPES.GET_STATE);
  if (state.ok) {
    settings = state.settings;
    const status = state.completedStatus;
    if (status?.fileName) elements.completedFileStatus.textContent = `${status.fileName} (${status.permission})`;
  }
  renderColorPresets();
  await refreshCompletedData();
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
  elements.completedFileStatus.textContent = result.ok ? "权限已授予" : result.message;
});
elements.addColorPreset.addEventListener("click", () => {
  const color = globalThis.prompt("颜色值", "#ffffff");
  if (color) updateColorPresets([...(settings.colorPresets || []), color]);
});
globalThis.addEventListener("resize", () => chart?.resize());

refreshState();
