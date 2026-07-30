import {
  deleteGroup,
  deletePage,
  movePageToGroup,
  normalizeData,
  renameGroup,
  renamePage,
  reorderGroups,
  reorderPages,
  searchTree,
  updateGroupAppearance
} from "../shared/domain.js";
import {
  createJsonFile,
  getDataStatus,
  loadDataLocation,
  pickExistingJsonFile,
  readGroupData,
  requestStoredFilePermission,
  saveAsJsonFile,
  saveDataLocation,
  writeGroupData
} from "../shared/data-store.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import { loadSettings, saveSettings } from "../shared/settings.js";

const app = document.getElementById("app");
const DEFAULT_GROUP_ICONS = ["📁", "📂", "🗂️", "📌", "🧩", "📝", "💡", "🎈"];
const DEFAULT_GROUP_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#14b8a6", "#ef4444", "#6366f1"];
const state = {
  query: "",
  selectedGroupId: "",
  data: { version: 1, groups: [] },
  settings: {},
  dataLocation: { mode: "localFile", publicUrl: "" },
  publicUrlDraft: "",
  fileStatus: { bound: false, fileName: "", boundAt: "", permission: "missing" },
  notice: "",
  dragInfo: null,
  dropIndicatorTarget: null,
  editingGroupId: "",
  editingGroupName: "",
  editingPageId: "",
  editingPageName: "",
  iconPopupGroupId: "",
  iconDraft: "",
  colorPopupGroupId: "",
  movePopupPageId: ""
};

app.addEventListener("click", (event) => {
  handleClick(event).catch(showRuntimeError);
});
app.addEventListener("input", handleInput);
app.addEventListener("change", (event) => {
  handleChange(event).catch(showRuntimeError);
});
app.addEventListener("keydown", (event) => {
  handleKeydown(event).catch(showRuntimeError);
});
app.addEventListener("focusout", (event) => {
  handleFocusOut(event).catch(showRuntimeError);
});
app.addEventListener("dragstart", handleDragStart);
app.addEventListener("dragover", handleDragOver);
app.addEventListener("drop", (event) => {
  handleDrop(event).catch(showRuntimeError);
});
app.addEventListener("dragend", handleDragEnd);
window.addEventListener("error", (event) => {
  state.notice = event.message || "设置页发生错误";
  render();
});
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  showRuntimeError(event.reason);
});
document.addEventListener("click", handleDocumentClick);

loadAll().catch(showRuntimeError);

async function loadAll(options = {}) {
  const previousNotice = state.notice;
  state.dataLocation = await loadDataLocation();
  state.publicUrlDraft = state.dataLocation.publicUrl || "";
  state.fileStatus = await getDataStatus();
  state.settings = await loadSettings();
  const readResult = await readGroupData();
  if (readResult.ok) {
    state.data = normalizeData(readResult.data);
    state.notice = options.preserveNotice ? previousNotice : "";
  } else {
    state.data = { version: 1, groups: [] };
    state.notice = options.preserveNotice && previousNotice ? previousNotice : readResult.message;
  }
  if (!state.selectedGroupId && state.data.groups[0]) {
    state.selectedGroupId = state.data.groups[0].id;
  }
  render();
}

function render() {
  applyTheme();
  app.innerHTML = `
    ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}

    ${renderManage()}
    ${renderSettings()}
  `;
}

function showRuntimeError(error) {
  state.notice = error?.message || String(error || "操作失败");
  render();
}

function renderManage() {
  const groups = searchTree(state.data, state.query);
  const selected = state.data.groups.find((group) => group.id === state.selectedGroupId) || state.data.groups[0];
  const selectedPages = selected?.pages || [];
  const selectedColor = selected ? getGroupColor(selected) : "";
  const selectedIcon = selected ? getGroupIcon(selected) : "";
  const isEditingSelected = selected && state.editingGroupId === selected.id;
  const isIconPopupOpen = selected && state.iconPopupGroupId === selected.id;
  const isColorPopupOpen = selected && state.colorPopupGroupId === selected.id;
  const selectedIconDraft = state.iconDraft || selectedIcon;

  return `
    <section class="manager">
      <aside class="group-list">
        <div class="group-list-search">
          <input data-field="query" value="${escapeHtml(state.query)}" placeholder="搜索分组、页面或域名" />
          ${renderIconButton("open-selected-group", "folder-open", "打开分组", selected ? "" : "disabled", "primary")}
        </div>
        <div class="group-list-items">
          ${groups.length ? groups.map(renderGroupButton).join("") : `<div class="empty">暂无分组</div>`}
        </div>
      </aside>
      <section class="page-list">
        ${
          selected
            ? `
              <div class="section-head">
                <div class="selected-group-title" style="--group-color: ${escapeAttribute(selectedColor)}">
                  <div class="color-editor-wrap">
                    <button type="button" class="group-color-dot" data-action="toggle-group-color" data-group-id="${escapeAttribute(selected.id)}" aria-label="配置分组颜色"></button>
                    ${isColorPopupOpen ? renderColorPopover(selected.id, selectedColor) : ""}
                  </div>
                  <div class="icon-editor-wrap">
                    <button type="button" class="group-icon-preview" data-action="toggle-group-icon" data-group-id="${escapeAttribute(selected.id)}" aria-label="配置分组图标">${escapeHtml(selectedIcon)}</button>
                    ${isIconPopupOpen ? renderIconPopover(selected.id, selectedIconDraft) : ""}
                  </div>
                  <div class="selected-group-line">
                    ${
                      isEditingSelected
                        ? `<input class="group-name-editor" data-field="group-name" data-group-id="${escapeAttribute(selected.id)}" value="${escapeHtml(state.editingGroupName)}" />`
                        : `<button type="button" class="group-name-display" data-action="edit-group-name" data-group-id="${escapeAttribute(selected.id)}">${escapeHtml(selected.name)}</button>`
                    }
                    <span>（${selected.pages.length} 个页面）</span>
                  </div>
                </div>
                <div class="section-actions">
                  ${renderIconButton("rename-group", "edit", "重命名", `data-group-id="${escapeAttribute(selected.id)}"`)}
                  ${renderIconButton("delete-group", "trash", "删除", `data-group-id="${escapeAttribute(selected.id)}"`, "danger")}
                </div>
              </div>
              ${selectedPages.length ? selectedPages.map((page) => renderPageRow(page, selected.id)).join("") : `<div class="empty">这个分组还没有页面</div>`}
            `
            : `<div class="empty">绑定 JSON 后开始保存页面</div>`
        }
      </section>
    </section>
  `;
}

function renderGroupButton(group) {
  const color = getGroupColor(group);
  return `
    <button type="button" draggable="true" data-drag-kind="group" data-action="select-group" data-group-id="${group.id}" class="group-item ${
      group.id === state.selectedGroupId ? "active" : ""
    }" style="--group-color: ${escapeAttribute(color)}">
      <span class="group-item-icon">${escapeHtml(getGroupIcon(group))}</span>
      <span class="group-item-title">
        <span class="group-item-name">${escapeHtml(group.name)}</span>
        <small>（${group.pages.length} 个页面）</small>
      </span>
    </button>
  `;
}

function renderIconPopover(groupId, value) {
  return `
    <div class="picker-popover icon-picker-popover">
      <div class="picker-row">
        <input data-field="group-icon-draft" data-group-id="${escapeAttribute(groupId)}" value="${escapeHtml(value)}" maxlength="8" placeholder="输入图标" />
        <button type="button" data-action="random-group-icon" data-group-id="${escapeAttribute(groupId)}">随机</button>
      </div>
      <div class="icon-options">
        ${DEFAULT_GROUP_ICONS.map((icon) => `
          <button type="button" class="icon-option" data-action="group-icon-option" data-group-id="${escapeAttribute(groupId)}" data-icon="${escapeAttribute(icon)}">${escapeHtml(icon)}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderColorPopover(groupId, value) {
  return `
    <div class="picker-popover color-picker-popover">
      <input class="color-native-input" type="color" data-field="group-color" data-group-id="${escapeAttribute(groupId)}" value="${escapeAttribute(value)}" aria-label="选择分组颜色" />
      <div class="color-options">
        ${DEFAULT_GROUP_COLORS.map((color) => `
          <button type="button" class="color-option" data-action="group-color-option" data-group-id="${escapeAttribute(groupId)}" data-color="${escapeAttribute(color)}" style="--swatch-color: ${escapeAttribute(color)}" aria-label="${escapeAttribute(color)}"></button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPageRow(page, groupId) {
  const pageName = getPageDisplayName(page);
  const isEditingPage = state.editingPageId === page.id;
  return `
    <article class="page-row" draggable="true" data-drag-kind="page" data-group-id="${escapeHtml(groupId)}" data-page-id="${escapeHtml(page.id)}">
      <div class="page-main">
        ${
          isEditingPage
            ? `<input class="page-name-editor" data-field="page-name" data-page-id="${escapeAttribute(page.id)}" value="${escapeHtml(state.editingPageName)}" />`
            : `<strong>${escapeHtml(pageName)}</strong>`
        }
        <span>${escapeHtml(page.domain)}</span>
      </div>
      <div class="row-actions">
        ${renderIconButton("open-page", "external-link", "打开", `data-url="${escapeAttribute(page.url)}"`)}
        ${renderIconButton("rename-page", "edit", "重命名", `data-page-id="${escapeAttribute(page.id)}"`)}
        ${renderMoveButton(page.id, groupId)}
        ${renderIconButton("delete-page", "trash", "删除", `data-page-id="${escapeAttribute(page.id)}"`, "danger")}
      </div>
    </article>
  `;
}

function renderMoveButton(pageId, currentGroupId) {
  const targets = state.data.groups.filter((group) => group.id !== currentGroupId);
  if (!targets.length) return "";
  return `
    <span class="move-menu-wrap">
      ${renderIconButton("toggle-page-move", "move", "移动到", `data-page-id="${escapeAttribute(pageId)}"`)}
      ${
        state.movePopupPageId === pageId
          ? `<div class="picker-popover move-picker-popover">
              ${targets.map((group) => `
                <button type="button" class="move-option" data-action="move-page" data-page-id="${escapeAttribute(pageId)}" data-target-group-id="${escapeAttribute(group.id)}">
                  <span class="group-item-icon" style="--group-color: ${escapeAttribute(getGroupColor(group))}">${escapeHtml(getGroupIcon(group))}</span>
                  <span>${escapeHtml(group.name)}</span>
                </button>
              `).join("")}
            </div>`
          : ""
      }
    </span>
  `;
}

function renderIconButton(action, icon, label, attrs = "", variant = "") {
  return `
    <button type="button" class="icon-button ${escapeAttribute(variant)}" data-action="${escapeAttribute(action)}" ${attrs} aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}">
      ${svgIcon(icon)}
    </button>
  `;
}

function svgIcon(name) {
  const icons = {
    "external-link": `
      <path d="M14 3h5v5"></path>
      <path d="M10 14 19 5"></path>
      <path d="M19 12v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"></path>
    `,
    "folder-open": `
      <path d="M3 8.5V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"></path>
      <path d="M4 10h16l-2 7a2 2 0 0 1-2 1.5H6a2 2 0 0 1-2-1.5l-1-5a1.5 1.5 0 0 1 1-2Z"></path>
    `,
    edit: `
      <path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z"></path>
      <path d="m13.5 7 3.5 3.5"></path>
    `,
    trash: `
      <path d="M4 7h16"></path>
      <path d="M9 7V5h6v2"></path>
      <path d="M8 10v8"></path>
      <path d="M12 10v8"></path>
      <path d="M16 10v8"></path>
      <path d="M6 7l1 13h10l1-13"></path>
    `,
    move: `
      <path d="M7 7h10"></path>
      <path d="m14 4 3 3-3 3"></path>
      <path d="M17 17H7"></path>
      <path d="m10 14-3 3 3 3"></path>
    `,
    sparkles: `
      <path d="M12 3 13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"></path>
      <path d="M19 15v4"></path>
      <path d="M17 17h4"></path>
      <path d="M5 3v4"></path>
      <path d="M3 5h4"></path>
    `
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons["external-link"]}</svg>`;
}

function renderSettings() {
  return `
    <section class="settings-grid">
      <section class="settings-card">
        <h2>数据与 JSON</h2>
        <label class="inline-setting">
          <span>保存到</span>
          <select data-field="data-location-mode">
            <option value="extension" ${selectedValue(state.dataLocation.mode, "extension")}>插件里</option>
            <option value="localFile" ${selectedValue(state.dataLocation.mode, "localFile")}>本地文件</option>
            <option value="publicUrl" ${selectedValue(state.dataLocation.mode, "publicUrl")}>公共 URL 文件</option>
          </select>
        </label>
        ${
          state.dataLocation.mode === "publicUrl"
            ? `
              <label>
                <span>公共 JSON URL</span>
                <input data-field="public-url" value="${escapeHtml(state.publicUrlDraft)}" placeholder="https://example.com/group.json" />
              </label>
              <div class="button-row">
                <button type="button" data-action="save-public-url">保存 URL</button>
              </div>
            `
            : ""
        }
        <p>${escapeHtml(fileStatusText())}</p>
        <div class="button-row">
          <button type="button" data-action="choose-file">重新选择</button>
          <button type="button" data-action="grant-permission" ${
            state.dataLocation.mode === "localFile" && state.fileStatus.bound ? "" : "disabled"
          }>授权读写</button>
          <button type="button" data-action="create-file">创建新文件</button>
          <button type="button" data-action="save-as-file">迁移/另存</button>
        </div>
      </section>

      <section class="settings-card">
        <h2>外观与小球</h2>
        <label class="inline-setting">
          <span>主题</span>
          <select data-setting="themeMode">
            <option value="system" ${selected("themeMode", "system")}>跟随系统</option>
            <option value="light" ${selected("themeMode", "light")}>浅色</option>
            <option value="dark" ${selected("themeMode", "dark")}>深色</option>
          </select>
        </label>
        <label class="inline-setting color-setting">
          <span>主题色</span>
          <input class="square-color-input" type="color" data-setting="accentColor" value="${escapeHtml(state.settings.accentColor || "#3b82f6")}" />
        </label>
        ${rangeSetting("ballSize", "尺寸", 32, 72, 1)}
        ${rangeSetting("ballOpacity", "透明度", 0.25, 1, 0.01)}
        ${rangeSetting("edgeOffset", "吸附边距", -36, 36, 1)}
        <label class="check-row">
          <input type="checkbox" data-setting="edgeHide" ${state.settings.edgeHide === true ? "checked" : ""} />
          <span>贴边隐藏</span>
        </label>
      </section>
    </section>
  `;
}

function rangeSetting(key, label, min, max, step) {
  const value = state.settings[key];
  return `
    <label>
      <span>${label}: ${escapeHtml(String(value))}</span>
      <input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${escapeHtml(String(value))}" />
    </label>
  `;
}

async function handleClick(event) {
  const target = event.target.closest("button");
  if (!target) return;

  const action = target.dataset.action;
  if (!action) return;

  if (action === "choose-file") await chooseFile();
  if (action === "grant-permission") await grantPermission();
  if (action === "create-file") await createFile();
  if (action === "save-as-file") await saveAsFile();
  if (action === "save-public-url") await savePublicUrl();
  if (action === "select-group") selectGroup(target.dataset.groupId);
  if (action === "rename-group" || action === "edit-group-name") startGroupRename(target.dataset.groupId);
  if (action === "delete-group") await deleteSelectedGroup(target.dataset.groupId);
  if (action === "toggle-group-icon") toggleGroupIconPicker(target.dataset.groupId);
  if (action === "random-group-icon") await commitGroupIcon(target.dataset.groupId, pickRandom(DEFAULT_GROUP_ICONS));
  if (action === "group-icon-option") await commitGroupIcon(target.dataset.groupId, target.dataset.icon);
  if (action === "toggle-group-color") toggleGroupColorPicker(target.dataset.groupId);
  if (action === "group-color-option") await commitGroupColor(target.dataset.groupId, target.dataset.color);
  if (action === "random-group-color") await commitGroupColor(target.dataset.groupId, pickRandom(DEFAULT_GROUP_COLORS));
  if (action === "rename-page") startPageRename(target.dataset.pageId);
  if (action === "delete-page") await deleteSelectedPage(target.dataset.pageId);
  if (action === "open-page") await sendMessage({ type: MESSAGE_TYPES.OPEN_PAGE, payload: { url: target.dataset.url } });
  if (action === "toggle-page-move") togglePageMovePicker(target.dataset.pageId);
  if (action === "move-page") await moveSelectedPage(target.dataset.pageId, target.dataset.targetGroupId);
  if (action === "open-selected-group") await openSelectedGroup();
}

function handleInput(event) {
  if (event.target.dataset.field === "query") {
    state.query = event.target.value;
    render();
  }
  if (event.target.dataset.field === "public-url") {
    state.publicUrlDraft = event.target.value;
  }
  if (event.target.dataset.field === "group-name") {
    state.editingGroupName = event.target.value;
  }
  if (event.target.dataset.field === "group-icon-draft") {
    state.iconDraft = event.target.value;
  }
  if (event.target.dataset.field === "page-name") {
    state.editingPageName = event.target.value;
  }
}

async function handleChange(event) {
  if (event.target.dataset.field === "move-page") {
    await moveSelectedPage(event.target.dataset.pageId, event.target.value);
    return;
  }
  if (event.target.dataset.field === "group-name") {
    await commitGroupRename(event.target.dataset.groupId, event.target.value);
    return;
  }
  if (event.target.dataset.field === "page-name") {
    await commitPageRename(event.target.dataset.pageId, event.target.value);
    return;
  }
  if (event.target.dataset.field === "group-icon-draft") {
    await commitGroupIcon(event.target.dataset.groupId, event.target.value);
    return;
  }
  if (event.target.dataset.field === "group-color") {
    await commitGroupColor(event.target.dataset.groupId, event.target.value);
    return;
  }
  if (event.target.dataset.field === "data-location-mode") {
    await changeDataLocationMode(event.target.value);
    return;
  }

  const key = event.target.dataset.setting;
  if (!key) return;

  const value = event.target.type === "checkbox"
    ? event.target.checked
    : event.target.type === "range"
      ? Number(event.target.value)
      : event.target.value;
  state.settings = await saveSettings({ [key]: value });
  render();
}

async function handleKeydown(event) {
  const field = event.target.dataset.field;
  if (field === "group-name" && event.key === "Enter") {
    event.preventDefault();
    await commitGroupRename(event.target.dataset.groupId, event.target.value);
  }
  if (field === "group-name" && event.key === "Escape") {
    event.preventDefault();
    cancelGroupRename();
  }
  if (field === "group-icon-draft" && event.key === "Enter") {
    event.preventDefault();
    await commitGroupIcon(event.target.dataset.groupId, event.target.value);
  }
  if (field === "group-icon-draft" && event.key === "Escape") {
    event.preventDefault();
    closePickers();
    render();
  }
  if (field === "page-name" && event.key === "Enter") {
    event.preventDefault();
    await commitPageRename(event.target.dataset.pageId, event.target.value);
  }
  if (field === "page-name" && event.key === "Escape") {
    event.preventDefault();
    cancelPageRename();
  }
}

async function handleFocusOut(event) {
  if (event.target.dataset.field === "group-name") {
    await commitGroupRename(event.target.dataset.groupId, event.target.value);
  }
  if (event.target.dataset.field === "page-name") {
    await commitPageRename(event.target.dataset.pageId, event.target.value);
  }
}

function handleDocumentClick(event) {
  const hasOpenFloating = Boolean(state.iconPopupGroupId || state.colorPopupGroupId || state.movePopupPageId);
  if (!hasOpenFloating) return;
  if (event.target.closest(".icon-editor-wrap, .color-editor-wrap, .move-menu-wrap, .picker-popover")) return;
  closeFloatingPanels();
  render();
}

async function chooseFile() {
  const result = await pickExistingJsonFile();
  state.notice = result.ok ? "已绑定 JSON 文件并获得读写权限" : result.message;
  await loadAll({ preserveNotice: true });
}

async function grantPermission() {
  const result = await requestStoredFilePermission("readwrite");
  state.notice = result.ok ? "已授权 JSON 文件读写" : result.message;
  await loadAll({ preserveNotice: true });
}

async function createFile() {
  const result = await createJsonFile();
  state.notice = result.ok ? "已创建 JSON 文件并获得读写权限" : result.message;
  await loadAll({ preserveNotice: true });
}

async function saveAsFile() {
  const result = await saveAsJsonFile(state.data);
  state.notice = result.ok ? "已迁移到新的 JSON 文件" : result.message;
  await loadAll({ preserveNotice: true });
}

async function changeDataLocationMode(mode) {
  state.dataLocation = await saveDataLocation({ mode });
  state.notice = "数据位置已更新";
  await loadAll({ preserveNotice: true });
}

async function savePublicUrl() {
  state.dataLocation = await saveDataLocation({ mode: "publicUrl", publicUrl: state.publicUrlDraft });
  state.notice = "公共 JSON URL 已保存";
  await loadAll({ preserveNotice: true });
}

function selectGroup(groupId) {
  state.selectedGroupId = groupId;
  state.editingGroupId = "";
  state.editingGroupName = "";
  state.editingPageId = "";
  state.editingPageName = "";
  closeFloatingPanels();
  render();
}

function startGroupRename(groupId) {
  const group = state.data.groups.find((item) => item.id === groupId);
  if (!group) return;
  state.editingGroupId = groupId;
  state.editingGroupName = group.name;
  state.editingPageId = "";
  state.editingPageName = "";
  closeFloatingPanels();
  render();
  requestAnimationFrame(() => app.querySelector(".group-name-editor")?.select());
}

function cancelGroupRename() {
  state.editingGroupId = "";
  state.editingGroupName = "";
  render();
}

async function commitGroupRename(groupId, value = state.editingGroupName) {
  if (state.editingGroupId !== groupId) return;
  const group = state.data.groups.find((item) => item.id === groupId);
  const name = String(value || "").trim();
  state.editingGroupId = "";
  state.editingGroupName = "";
  if (!group || !name || name === group.name) {
    render();
    return;
  }
  const previousName = group.name;
  state.data = renameGroup(state.data, groupId, name);
  await persistData("分组已重命名", async () => {
    if (state.settings.recentGroupName === previousName) {
      state.settings = await saveSettings({ recentGroupName: name });
    }
  });
}

function toggleGroupIconPicker(groupId) {
  const group = state.data.groups.find((item) => item.id === groupId);
  if (!group) return;
  state.iconPopupGroupId = state.iconPopupGroupId === groupId ? "" : groupId;
  state.iconDraft = state.iconPopupGroupId ? (group.icon || getGroupIcon(group)) : "";
  state.colorPopupGroupId = "";
  state.movePopupPageId = "";
  state.editingGroupId = "";
  state.editingPageId = "";
  render();
  if (state.iconPopupGroupId) {
    requestAnimationFrame(() => app.querySelector('[data-field="group-icon-draft"]')?.focus());
  }
}

function toggleGroupColorPicker(groupId) {
  if (!state.data.groups.some((item) => item.id === groupId)) return;
  state.colorPopupGroupId = state.colorPopupGroupId === groupId ? "" : groupId;
  state.iconPopupGroupId = "";
  state.iconDraft = "";
  state.movePopupPageId = "";
  state.editingGroupId = "";
  state.editingPageId = "";
  render();
}

function closePickers() {
  state.iconPopupGroupId = "";
  state.iconDraft = "";
  state.colorPopupGroupId = "";
}

function closeFloatingPanels() {
  closePickers();
  state.movePopupPageId = "";
}

async function commitGroupIcon(groupId, value = state.iconDraft) {
  const icon = sanitizeIcon(value);
  closePickers();
  if (!icon) {
    render();
    return;
  }
  await changeGroupAppearance(groupId, { icon });
}

async function commitGroupColor(groupId, value) {
  const color = sanitizeColor(value);
  closePickers();
  if (!color) {
    render();
    return;
  }
  await changeGroupAppearance(groupId, { color });
}

async function changeGroupAppearance(groupId, patch) {
  if (!groupId) return;
  state.data = updateGroupAppearance(state.data, groupId, patch);
  await persistData("分组样式已更新");
}

function startPageRename(pageId) {
  const page = state.data.groups.flatMap((group) => group.pages).find((item) => item.id === pageId);
  if (!page) return;
  state.editingPageId = pageId;
  state.editingPageName = getPageDisplayName(page);
  closeFloatingPanels();
  render();
  requestAnimationFrame(() => app.querySelector(".page-name-editor")?.select());
}

function cancelPageRename() {
  state.editingPageId = "";
  state.editingPageName = "";
  render();
}

async function commitPageRename(pageId, value = state.editingPageName) {
  if (state.editingPageId !== pageId) return;
  const page = state.data.groups.flatMap((group) => group.pages).find((item) => item.id === pageId);
  const title = String(value || "").trim();
  state.editingPageId = "";
  state.editingPageName = "";
  if (!page || !title || title === getPageDisplayName(page)) {
    render();
    return;
  }
  state.data = renamePage(state.data, pageId, title);
  await persistData("页面已重命名");
}

function togglePageMovePicker(pageId) {
  if (!state.data.groups.some((group) => group.pages.some((page) => page.id === pageId))) return;
  closePickers();
  state.editingPageId = "";
  state.editingPageName = "";
  state.movePopupPageId = state.movePopupPageId === pageId ? "" : pageId;
  render();
}

async function deleteSelectedGroup(groupId) {
  const group = state.data.groups.find((item) => item.id === groupId);
  if (!group || !confirm(`删除「${group.name}」及其中所有页面？`)) return;
  state.data = deleteGroup(state.data, groupId);
  state.selectedGroupId = state.data.groups[0]?.id || "";
  await persistData("分组已删除");
}

async function deleteSelectedPage(pageId) {
  const page = state.data.groups.flatMap((group) => group.pages).find((item) => item.id === pageId);
  if (!page || !confirm(`删除「${getPageDisplayName(page)}」？`)) return;
  state.data = deletePage(state.data, pageId);
  await persistData("页面已删除");
}

async function moveSelectedPage(pageId, targetGroupId) {
  if (!targetGroupId) return;
  const currentGroup = state.data.groups.find((group) => group.pages.some((page) => page.id === pageId));
  if (!currentGroup) return;
  if (currentGroup.id === targetGroupId) return;

  const targetGroup = state.data.groups.find((group) => group.id === targetGroupId);
  if (!targetGroup) {
    state.notice = "未找到目标分组";
    render();
    return;
  }

  state.data = movePageToGroup(state.data, pageId, targetGroup.id);
  state.movePopupPageId = "";
  await persistData("页面已移动");
}

async function openSelectedGroup() {
  const groupId = state.selectedGroupId || state.data.groups[0]?.id;
  if (!groupId) return;
  await sendMessage({ type: MESSAGE_TYPES.OPEN_GROUP, payload: { groupId } });
}

function handleDragStart(event) {
  const item = event.target.closest?.("[data-drag-kind]");
  if (!item) return;

  state.dragInfo = {
    kind: item.dataset.dragKind,
    groupId: item.dataset.groupId || "",
    pageId: item.dataset.pageId || ""
  };
  event.dataTransfer?.setData("text/plain", JSON.stringify(state.dragInfo));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
  const target = getValidDropTarget(event.target);
  if (!target) {
    clearDropIndicator();
    return;
  }
  event.preventDefault?.();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  showDropIndicator(target, getDropPosition(event, target));
}

async function handleDrop(event) {
  const target = getValidDropTarget(event.target);
  if (!target) {
    clearDropIndicator();
    return;
  }
  event.preventDefault?.();

  const position = getDropPosition(event, target);
  clearDropIndicator();
  if (state.dragInfo.kind === "group") {
    state.data = reorderGroups(state.data, state.dragInfo.groupId, target.dataset.groupId, position);
    await persistData("分组顺序已更新");
  }
  if (state.dragInfo.kind === "page") {
    state.data = reorderPages(
      state.data,
      state.dragInfo.groupId,
      state.dragInfo.pageId,
      target.dataset.pageId,
      position
    );
    await persistData("页面顺序已更新");
  }

  state.dragInfo = null;
}

function handleDragEnd() {
  clearDropIndicator();
  state.dragInfo = null;
}

function getValidDropTarget(target) {
  const item = target.closest?.("[data-drag-kind]");
  if (!item || !state.dragInfo) return null;
  if (state.dragInfo.kind === "group" && item.dataset.dragKind === "group") return item;
  if (
    state.dragInfo.kind === "page" &&
    item.dataset.dragKind === "page" &&
    item.dataset.groupId === state.dragInfo.groupId
  ) {
    return item;
  }
  return null;
}

function getDropPosition(event, target) {
  const rect = target.getBoundingClientRect?.();
  if (!rect || !Number.isFinite(event.clientY)) return "before";
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function showDropIndicator(target, position) {
  clearDropIndicator();
  target.classList.add(position === "after" ? "group-drop-after" : "group-drop-before");
  state.dropIndicatorTarget = target;
}

function clearDropIndicator() {
  if (!state.dropIndicatorTarget) return;
  state.dropIndicatorTarget.classList.remove("group-drop-before", "group-drop-after");
  state.dropIndicatorTarget = null;
}

async function persistData(message, afterWrite) {
  const result = await writeGroupData(state.data);
  state.notice = result.ok ? message : result.message;
  if (result.ok) {
    if (typeof afterWrite === "function") await afterWrite();
    await notifyContentDataUpdated();
  }
  await loadAll();
  return result;
}

async function notifyContentDataUpdated() {
  const tabsApi = globalThis.chrome?.tabs;
  if (!tabsApi?.query || !tabsApi?.sendMessage) return;

  const tabs = await new Promise((resolve) => tabsApi.query({}, resolve));
  await Promise.all(
    tabs.map(
      (tab) =>
        new Promise((resolve) => {
          if (!tab.id) {
            resolve();
            return;
          }
          tabsApi.sendMessage(tab.id, { type: MESSAGE_TYPES.DATA_UPDATED }, () => {
            globalThis.chrome?.runtime?.lastError;
            resolve();
          });
        })
    )
  );
}

function selected(key, value) {
  return state.settings[key] === value ? "selected" : "";
}

function selectedValue(current, value) {
  return current === value ? "selected" : "";
}

function fileStatusText() {
  if (state.dataLocation.mode === "extension") return "保存位置：插件内";
  if (state.dataLocation.mode === "publicUrl") {
    return state.dataLocation.publicUrl ? `保存位置：${state.dataLocation.publicUrl}` : "未配置公共 JSON URL";
  }
  if (!state.fileStatus.bound) return "未绑定 JSON 文件";
  const permissionText = state.fileStatus.permission === "granted" ? "已授权" : "需要授权";
  return `已绑定：${state.fileStatus.fileName || "group.json"} · ${permissionText}`;
}

function getPageDisplayName(page) {
  return page?.name || page?.title || page?.url || "";
}

function getGroupIcon(group) {
  const icon = sanitizeIcon(group?.icon);
  if (icon) return icon;
  return pickStable(DEFAULT_GROUP_ICONS, group?.id || group?.name);
}

function getGroupColor(group) {
  const color = sanitizeColor(group?.color);
  if (color) return color;
  return pickStable(DEFAULT_GROUP_COLORS, group?.id || group?.name);
}

function applyTheme() {
  document.body.dataset.theme = state.settings.themeMode || "system";
  document.body.style.setProperty("--accent", state.settings.accentColor || "#3b82f6");
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { ok: false, message: chrome.runtime.lastError?.message || "操作失败" });
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function sanitizeIcon(value) {
  return Array.from(String(value || "").trim()).slice(0, 4).join("");
}

function sanitizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "";
}

function pickRandom(values) {
  return values[Math.floor(Math.random() * values.length)] || "";
}

function pickStable(values, seed) {
  if (!values.length) return "";
  const text = String(seed || "group");
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return values[hash % values.length];
}
