(() => {
  if (document.getElementById("group-extension-root")) return;

  const MESSAGE_TYPES = {
    GET_STATE: "GROUP_GET_STATE",
    GET_PAGE_DRAFT: "GROUP_GET_PAGE_DRAFT",
    SAVE_CURRENT_PAGE: "GROUP_SAVE_CURRENT_PAGE",
    OPEN_GROUP: "GROUP_OPEN_GROUP",
    OPEN_PAGE: "GROUP_OPEN_PAGE",
    OPEN_OPTIONS: "GROUP_OPEN_OPTIONS",
    SET_QUICK_ACCESS_PIN: "GROUP_SET_QUICK_ACCESS_PIN",
    DELETE_PAGE: "GROUP_DELETE_PAGE",
    RENAME_PAGE: "GROUP_RENAME_PAGE",
    REORDER_GROUPS: "GROUP_REORDER_GROUPS",
    REORDER_PAGES: "GROUP_REORDER_PAGES",
    DATA_UPDATED: "GROUP_DATA_UPDATED",
    UPDATE_SETTINGS: "GROUP_UPDATE_SETTINGS"
  };

  const DEFAULT_GROUP_ICONS = ["📁", "📂", "🗂️", "📌", "🧩", "📝", "💡", "🎈"];
  const DEFAULT_GROUP_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#14b8a6", "#ef4444", "#6366f1"];

  const state = {
    isOpen: false,
    dragging: false,
    dragMoved: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    settings: {},
    data: { version: 1, groups: [] },
    fileBound: false,
    needsPermission: false,
    draft: null,
    selectedGroupName: "",
    selectedGroupId: "",
    dragInfo: null,
    dropIndicatorTarget: null,
    editingPageId: "",
    editingPageName: "",
    expandedGroupIds: []
  };

  const root = document.createElement("div");
  root.id = "group-extension-root";
  root.innerHTML = `
    <div class="group-shell" data-side="right">
      <button class="group-ball" type="button" title="group" aria-label="group">
        <span class="group-ball-mark">g</span>
      </button>
      <span class="group-recent-label"></span>
      <section class="group-panel" hidden>
        <div class="group-setup" hidden>
          <strong class="group-setup-title">绑定 group.json</strong>
          <p class="group-setup-copy">先选择或创建一个 JSON 文件，之后页面会保存到这个本地文件里。</p>
        </div>
        <div class="group-save-view">
          <div class="group-field">
            <div class="group-group-buttons" role="group" aria-label="选择分组"></div>
            <div class="group-add-popover" hidden>
              <input class="group-add-input" autocomplete="off" placeholder="新分组名" />
            </div>
          </div>
          <div class="group-page-save-row">
            <input class="group-page-input" autocomplete="off" />
            <button class="group-save-button" type="button" title="保存" aria-label="保存">
              ${renderSaveIcon()}
            </button>
            <button class="group-panel-options" type="button" title="选项" aria-label="选项">
              ${renderOptionsIcon()}
            </button>
          </div>
        </div>
        <div class="group-preview" hidden>
          <input class="group-search-input" placeholder="搜索分组或页面，Enter 打开首个分组" autocomplete="off" />
          <div class="group-quick-access"></div>
          <div class="group-tree"></div>
        </div>
      </section>
      <div class="group-toast" hidden></div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const shell = root.querySelector(".group-shell");
  const ball = root.querySelector(".group-ball");
  const panel = root.querySelector(".group-panel");
  const setupView = root.querySelector(".group-setup");
  const saveView = root.querySelector(".group-save-view");
  const pageInput = root.querySelector(".group-page-input");
  const groupButtons = root.querySelector(".group-group-buttons");
  const addPopover = root.querySelector(".group-add-popover");
  const addInput = root.querySelector(".group-add-input");
  const saveButton = root.querySelector(".group-save-button");
  const openOptionsButton = root.querySelector(".group-panel-options");
  const preview = root.querySelector(".group-preview");
  const searchInput = root.querySelector(".group-search-input");
  const quickAccess = root.querySelector(".group-quick-access");
  const tree = root.querySelector(".group-tree");
  const toast = root.querySelector(".group-toast");
  const recentLabel = root.querySelector(".group-recent-label");

  ball.addEventListener("click", () => {
    if (state.dragMoved) {
      state.dragMoved = false;
      return;
    }
    runSafely(togglePanel(!state.isOpen));
  });
  ball.addEventListener("pointerdown", startDrag);
  saveButton.addEventListener("click", () => runSafely(saveCurrentPage()));
  openOptionsButton.addEventListener("click", openOptions);
  groupButtons.addEventListener("click", handleGroupButtonClick);
  addInput.addEventListener("keydown", handleAddInputKeydown);
  quickAccess.addEventListener("click", handlePageActionClick);
  tree.addEventListener("click", handleTreeClick);
  tree.addEventListener("keydown", (event) => runSafely(handleTreeKeydown(event)));
  tree.addEventListener("focusout", (event) => runSafely(handleTreeFocusOut(event)));
  tree.addEventListener("dragstart", handleTreeDragStart);
  tree.addEventListener("dragover", handleTreeDragOver);
  tree.addEventListener("drop", (event) => runSafely(handleTreeDrop(event)));
  tree.addEventListener("dragend", handleTreeDragEnd);
  searchInput.addEventListener("input", () => renderTree(searchTree(state.data, searchInput.value)));
  searchInput.addEventListener("keydown", handleSearchKeydown);
  pageInput.addEventListener("keydown", handleInputKeydown);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  globalThis.chrome?.runtime?.onMessage?.addListener((message) => {
    if (message?.type === MESSAGE_TYPES.DATA_UPDATED) {
      runSafely(refreshState(false));
    }
  });
  shell.addEventListener("mouseenter", () => shell.classList.remove("group-edge-hidden"));
  shell.addEventListener("mouseleave", () => {
    if (!state.isOpen && state.settings.edgeHide === true) {
      shell.classList.add("group-edge-hidden");
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    showToast(event.reason?.message || "group 操作失败");
  });
  window.addEventListener("error", (event) => {
    showToast(event.message || "group 操作失败");
  });

  runSafely(refreshState(false));

  async function togglePanel(open) {
    state.isOpen = open;
    panel.hidden = !open;
    shell.classList.toggle("group-open", open);
    shell.classList.remove("group-edge-hidden");

    if (open) {
      await refreshState(true);
    } else {
      addPopover.hidden = true;
      if (state.settings.edgeHide === true) {
        shell.classList.add("group-edge-hidden");
      }
    }
  }

  async function refreshState(includeDraft) {
    const response = await sendMessage({ type: MESSAGE_TYPES.GET_STATE });
    state.fileBound = Boolean(response?.bound && response?.ok);
    state.needsPermission = Boolean(response?.bound && response?.reason === "permission_denied");
    state.data = response?.data || { version: 1, groups: [] };
    state.settings = response?.settings || {};

    applySettings();
    setSetupVisible(!state.fileBound);

    if (includeDraft && state.fileBound) {
      const draftResponse = await sendMessage({
        type: MESSAGE_TYPES.GET_PAGE_DRAFT,
        payload: {
          title: document.title,
          url: location.href
        }
      });
      state.draft = draftResponse?.draft || { title: document.title, url: location.href };
      state.selectedGroupName = state.settings.recentGroupName || state.data.groups[0]?.name || "";
      pageInput.value = state.draft.title || document.title || location.hostname;
    }

    syncSelectedGroupSelection();
    renderGroupButtons();
    renderQuickAccess();
    renderTree(searchTree(state.data, searchInput.value));
  }

  function applySettings() {
    const settings = state.settings || {};
    const accentColor = settings.accentColor || "#3b82f6";
    shell.style.setProperty("--group-accent", accentColor);
    shell.style.setProperty("--group-accent-contrast", readableTextColor(accentColor));
    shell.style.setProperty("--group-ball-size", `${settings.ballSize || 44}px`);
    shell.style.setProperty("--group-ball-opacity", String(settings.ballOpacity ?? 0.72));
    shell.style.setProperty("--group-edge-offset", `${settings.edgeOffset ?? 12}px`);
    shell.dataset.theme = settings.themeMode || "system";
    applySavedPosition(settings.ballPosition);
    recentLabel.textContent = "";
  }

  function applySavedPosition(position) {
    if (!position || !["left", "right"].includes(position.side)) return;
    const offset = state.settings.edgeOffset ?? 12;
    const top = clampTop(position.top);
    shell.dataset.side = position.side;
    shell.style.top = `${top}px`;
    shell.style.transform = "none";
    if (position.side === "left") {
      shell.style.left = `${offset}px`;
      shell.style.right = "auto";
    } else {
      shell.style.right = `${offset}px`;
      shell.style.left = "auto";
    }
  }

  function setSetupVisible(visible) {
    const title = setupView.querySelector(".group-setup-title");
    const copy = setupView.querySelector(".group-setup-copy");
    title.textContent = state.needsPermission ? "授权 JSON 读写" : "绑定 group.json";
    copy.textContent = state.needsPermission
      ? "已找到绑定文件，但 Chrome 需要你在设置页点击授权读写。"
      : "先选择或创建一个 JSON 文件，之后页面会保存到这个本地文件里。";
    setupView.hidden = !visible;
    saveView.hidden = visible;
    preview.hidden = visible;
  }

  function syncSelectedGroupSelection() {
    const groups = Array.isArray(state.data?.groups) ? state.data.groups : [];
    if (!state.fileBound || !groups.length) {
      state.selectedGroupId = "";
      state.selectedGroupName = "";
      return;
    }

    const selectedById = state.selectedGroupId
      ? groups.find((group) => group.id === state.selectedGroupId)
      : null;
    if (selectedById) {
      state.selectedGroupName = String(selectedById.name || "").trim();
      return;
    }

    const selectedName = String(state.selectedGroupName || "").trim();
    const selectedByName = selectedName
      ? groups.find((group) => String(group.name || "").trim() === selectedName)
      : null;
    if (selectedByName) {
      state.selectedGroupId = selectedByName.id || "";
      state.selectedGroupName = String(selectedByName.name || "").trim();
      return;
    }

    const recentName = String(state.settings.recentGroupName || "").trim();
    const recentGroup = recentName
      ? groups.find((group) => String(group.name || "").trim() === recentName)
      : null;
    const fallback = recentGroup || groups[0];
    state.selectedGroupId = fallback?.id || "";
    state.selectedGroupName = String(fallback?.name || "").trim();
  }

  function renderGroupButtons() {
    const groups = state.data.groups || [];
    if (!state.fileBound) {
      groupButtons.innerHTML = "";
      return;
    }

    const selectedName = state.selectedGroupName.trim();
    const selectedNameLower = selectedName.toLowerCase();
    const selectedGroupId = state.selectedGroupId;
    const items = groups
      .map((group) => ({ ...group, name: String(group.name || "").trim() }))
      .filter((group) => group.name);
    const hasSelectedGroup = items.some(
      (group) => (selectedGroupId && group.id === selectedGroupId) || group.name.toLowerCase() === selectedNameLower
    );
    if (selectedName && !hasSelectedGroup) {
      items.push({ id: `draft-${selectedName}`, name: selectedName, icon: "", color: "" });
    }

    groupButtons.innerHTML = [
      ...items.map((group) => {
        const active = selectedGroupId ? group.id === selectedGroupId : group.name.toLowerCase() === selectedNameLower;
        const color = getGroupColor(group);
        return `
          <button class="group-group-chip ${active ? "group-group-chip-active" : ""}" type="button" data-group-id="${escapeAttribute(group.id)}" data-group-name="${escapeAttribute(group.name)}" title="${escapeAttribute(group.name)}" style="--group-item-color: ${escapeAttribute(color)}">
            <span class="group-chip-icon">${escapeHtml(getGroupIcon(group))}</span>
            <span class="group-chip-name">${escapeHtml(group.name)}</span>
          </button>
        `;
      }),
      `<button class="group-add-group" type="button" title="新增分组" aria-label="新增分组">${renderAddIcon()}</button>`
    ].join("");
  }

  function handleGroupButtonClick(event) {
    const addButton = event.target.closest?.(".group-add-group");
    if (addButton && groupButtons.contains(addButton)) {
      addGroupName();
      return;
    }

    const button = event.target.closest?.(".group-group-chip");
    if (!button || !groupButtons.contains(button)) return;
    selectGroupName(button.dataset.groupName || button.textContent, button.dataset.groupId || "");
  }

  function addGroupName() {
    addPopover.hidden = false;
    addInput.value = "";
    requestAnimationFrame(() => addInput.focus());
  }

  function handleAddInputKeydown(event) {
    if (event.key === "Escape") {
      addPopover.hidden = true;
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const name = addInput.value.trim();
    if (!name) return;
    addPopover.hidden = true;
    selectGroupName(name);
  }

  function selectGroupName(name, groupId = "") {
    if (!name) return;
    addPopover.hidden = true;
    const selectedName = String(name).trim();
    const group = (state.data.groups || []).find(
      (item) => (groupId && item.id === groupId) || String(item.name || "").trim() === selectedName
    );
    state.selectedGroupId = group?.id || "";
    state.selectedGroupName = group ? String(group.name || "").trim() : selectedName;
    renderGroupButtons();
  }

  async function saveCurrentPage() {
    if (!state.fileBound) {
      showToast("请先绑定 group.json");
      return;
    }

    const groupName = state.selectedGroupName.trim();
    const pageTitle = pageInput.value.trim();
    const url = state.draft?.url || location.href;
    const response = await sendMessage({
      type: MESSAGE_TYPES.SAVE_CURRENT_PAGE,
      payload: { groupName, pageTitle, url }
    });

    if (response?.ok && response.status === "saved") {
      state.selectedGroupName = response.group.name;
      state.selectedGroupId = response.group.id || state.selectedGroupId;
      flashBall();
      showToast(`已保存到「${response.group.name}」`);
      await refreshState(false);
      togglePanel(false);
      return;
    }

    if (response?.ok && response.status === "duplicate") {
      showToast(`已在「${response.existingGroupName}」中`);
      return;
    }

    showToast(response?.message || "保存失败");
  }

  function renderQuickAccess() {
    quickAccess.innerHTML = "";
    if (!state.fileBound) return;

    const pages = getQuickAccessPages(state.data, 5);
    if (!pages.length) {
      quickAccess.innerHTML = `<div class="group-quick-empty">固定页面后显示快捷访问</div>`;
      return;
    }

    quickAccess.innerHTML = `<div class="group-quick-list" aria-label="快捷访问">${pages.map(renderQuickAccessItem).join("")}</div>`;
  }

  function renderQuickAccessItem(page) {
    const title = getPageDisplayName(page);
    const color = getGroupColor(page);
    return `
      <button class="group-quick-access-item group-quick-open" type="button" data-page-id="${escapeAttribute(page.id)}" data-url="${escapeAttribute(page.url)}" title="${escapeAttribute(page.url)}" style="--group-item-color: ${escapeAttribute(color)}">
        <span class="group-quick-title">${escapeHtml(title)}</span>
      </button>
    `;
  }

  function renderTree(groups) {
    tree.innerHTML = "";
    if (!state.fileBound) return;

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "group-empty";
      empty.textContent = "没有匹配结果";
      tree.appendChild(empty);
      return;
    }

    for (const group of groups) {
      const groupNode = document.createElement("section");
      const expanded = state.expandedGroupIds.includes(group.id);
      groupNode.className = `group-node${expanded ? "" : " group-node-collapsed"}`;
      groupNode.draggable = true;
      groupNode.dataset.dragKind = "group";
      groupNode.dataset.groupId = group.id;
      groupNode.style.setProperty("--group-item-color", getGroupColor(group));
      const pageRows = group.pages.map((page) => {
        const pageName = getPageDisplayName(page);
        const isEditing = state.editingPageId === page.id;
        return `
        <div class="group-page-row" draggable="${isEditing ? "false" : "true"}" data-drag-kind="page" data-group-id="${escapeAttribute(group.id)}" data-page-id="${escapeAttribute(page.id)}">
          ${
            isEditing
              ? `<input class="group-page-title-input" data-page-id="${escapeAttribute(page.id)}" value="${escapeHtml(state.editingPageName)}" autocomplete="off" />`
              : `<button class="group-page-link" type="button" data-page-id="${escapeAttribute(page.id)}" data-url="${escapeAttribute(page.url)}" title="${escapeAttribute(page.url)}">
                  <span class="group-page-title">${escapeHtml(pageName)}</span>
                </button>`
          }
          <div class="group-page-actions">
            <button class="group-icon-action group-pin-page ${page.quickAccessPinned ? "group-pin-page-active" : ""}" type="button" data-page-id="${escapeAttribute(page.id)}" data-pinned="${page.quickAccessPinned ? "false" : "true"}" title="${page.quickAccessPinned ? "取消固定" : "固定到快捷访问"}" aria-label="${page.quickAccessPinned ? "取消固定" : "固定到快捷访问"}">
              ${renderPinIcon(page.quickAccessPinned)}
            </button>
            <button class="group-icon-action group-rename-page" type="button" data-page-id="${escapeAttribute(page.id)}" data-page-name="${escapeAttribute(pageName)}" title="重命名页面" aria-label="重命名页面">
              ${renderRenameIcon()}
            </button>
            <button class="group-icon-action group-remove-page" type="button" data-page-id="${escapeAttribute(page.id)}" title="移除页面" aria-label="移除页面">
              ${renderTrashIcon()}
            </button>
          </div>
        </div>
      `;
      }).join("");
      groupNode.innerHTML = `
        <div class="group-node-header">
          <button class="group-node-main" type="button" data-group-id="${escapeAttribute(group.id)}" aria-expanded="${String(expanded)}">
            <span class="group-node-icon" aria-hidden="true">${escapeHtml(getGroupIcon(group))}</span>
            <span class="group-node-name">${escapeHtml(group.name)}</span>
            <span class="group-node-subtitle">（${group.pages.length}个页面）</span>
          </button>
          <button class="group-open-all" type="button" data-group-id="${escapeAttribute(group.id)}" title="打开全部" aria-label="打开全部">${renderOpenAllIcon()}</button>
        </div>
        <div class="group-pages">${pageRows || `<div class="group-empty">这个分组还没有页面</div>`}</div>
      `;

      tree.appendChild(groupNode);
    }
  }

  function handleTreeClick(event) {
    const toggleButton = event.target.closest?.(".group-node-main");
    if (toggleButton && tree.contains(toggleButton)) {
      const groupNode = toggleButton.closest(".group-node");
      const collapsed = groupNode.classList.toggle("group-node-collapsed");
      const groupId = toggleButton.dataset.groupId;
      state.expandedGroupIds = collapsed
        ? state.expandedGroupIds.filter((id) => id !== groupId)
        : state.expandedGroupIds.includes(groupId)
          ? state.expandedGroupIds
          : [...state.expandedGroupIds, groupId];
      toggleButton.setAttribute("aria-expanded", String(!collapsed));
      return;
    }

    const renamePageButton = event.target.closest?.(".group-rename-page");
    if (renamePageButton && tree.contains(renamePageButton)) {
      event.stopPropagation?.();
      startRenamePage(renamePageButton.dataset.pageId, renamePageButton.dataset.pageName);
      return;
    }

    const removePageButton = event.target.closest?.(".group-remove-page");
    if (removePageButton && tree.contains(removePageButton)) {
      event.stopPropagation?.();
      runSafely(removePage(removePageButton.dataset.pageId));
      return;
    }

    const openAllButton = event.target.closest?.(".group-open-all");
    if (openAllButton && tree.contains(openAllButton)) {
      runSafely(openGroup(openAllButton.dataset.groupId));
      return;
    }

    handlePageActionClick(event);
  }

  function handleTreeDragStart(event) {
    const item = event.target.closest?.("[data-drag-kind]");
    if (!item || !tree.contains(item)) return;

    state.dragInfo = {
      kind: item.dataset.dragKind,
      groupId: item.dataset.groupId || "",
      pageId: item.dataset.pageId || ""
    };
    event.dataTransfer?.setData("text/plain", "group-sort");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handleTreeDragOver(event) {
    const target = getValidTreeDropTarget(event.target);
    if (!target) {
      clearDropIndicator();
      return;
    }
    event.preventDefault?.();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    showDropIndicator(target, getDropPosition(event, target));
  }

  async function handleTreeDrop(event) {
    const target = getValidTreeDropTarget(event.target);
    if (!target) {
      clearDropIndicator();
      return;
    }
    event.preventDefault?.();

    const position = getDropPosition(event, target);
    clearDropIndicator();
    if (state.dragInfo.kind === "group") {
      await reorderGroups(state.dragInfo.groupId, target.dataset.groupId, position);
    }
    if (state.dragInfo.kind === "page") {
      await reorderPages(state.dragInfo.groupId, state.dragInfo.pageId, target.dataset.pageId, position);
    }

    state.dragInfo = null;
  }

  function handleTreeDragEnd() {
    clearDropIndicator();
    state.dragInfo = null;
  }

  function getValidTreeDropTarget(target) {
    const item = target.closest?.("[data-drag-kind]");
    if (!item || !tree.contains(item) || !state.dragInfo) return null;
    if (
      state.dragInfo.kind === "group" &&
      item.dataset.dragKind === "group" &&
      item.dataset.groupId !== state.dragInfo.groupId
    ) {
      return item;
    }
    if (
      state.dragInfo.kind === "page" &&
      item.dataset.dragKind === "page" &&
      item.dataset.groupId === state.dragInfo.groupId &&
      item.dataset.pageId !== state.dragInfo.pageId
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

  function handlePageActionClick(event) {
    const pinButton = event.target.closest?.(".group-pin-page");
    if (pinButton && panel.contains(pinButton)) {
      runSafely(setQuickAccessPin(pinButton.dataset.pageId, pinButton.dataset.pinned === "true"));
      return;
    }

    const pageButton = event.target.closest?.(".group-page-link, .group-quick-open");
    if (pageButton && panel.contains(pageButton)) {
      runSafely(openPage(pageButton.dataset.url, pageButton.dataset.pageId));
    }
  }

  async function openGroup(groupId) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.OPEN_GROUP,
      payload: { groupId }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    } else {
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? `已打开 ${response.opened} 个页面` : response?.message || "打开失败");
  }

  async function openPage(url, pageId) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.OPEN_PAGE,
      payload: { url, pageId }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "已打开页面" : response?.message || "打开失败");
  }

  async function setQuickAccessPin(pageId, pinned) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.SET_QUICK_ACCESS_PIN,
      payload: { pageId, pinned }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? (pinned ? "已固定到快捷访问" : "已取消固定") : response?.message || "操作失败");
  }

  async function reorderGroups(sourceGroupId, targetGroupId, position) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.REORDER_GROUPS,
      payload: { sourceGroupId, targetGroupId, position }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "分组顺序已更新" : response?.message || "排序失败");
  }

  async function reorderPages(groupId, sourcePageId, targetPageId, position) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.REORDER_PAGES,
      payload: { groupId, sourcePageId, targetPageId, position }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "页面顺序已更新" : response?.message || "排序失败");
  }

  function startRenamePage(pageId, currentName) {
    if (!pageId) return;
    state.editingPageId = pageId;
    state.editingPageName = currentName || "";
    renderTree(searchTree(state.data, searchInput.value));
    requestAnimationFrame(() => {
      const input = tree.querySelector(`.group-page-title-input[data-page-id="${cssEscape(pageId)}"]`);
      input?.focus();
      input?.select();
    });
  }

  function cancelRenamePage() {
    state.editingPageId = "";
    state.editingPageName = "";
    renderTree(searchTree(state.data, searchInput.value));
  }

  async function commitRenamePage(pageId, value) {
    if (!pageId || state.editingPageId !== pageId) return;
    const name = String(value || "").trim();
    const currentPage = state.data.groups
      .flatMap((group) => group.pages || [])
      .find((page) => page.id === pageId);
    state.editingPageId = "";
    state.editingPageName = "";
    if (!name || name === getPageDisplayName(currentPage)) {
      renderTree(searchTree(state.data, searchInput.value));
      return;
    }
    const response = await sendMessage({
      type: MESSAGE_TYPES.RENAME_PAGE,
      payload: { pageId, name }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "已重命名页面" : response?.message || "重命名失败");
  }

  async function handleTreeKeydown(event) {
    const input = event.target.closest?.(".group-page-title-input");
    if (!input || !tree.contains(input)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      await commitRenamePage(input.dataset.pageId, input.value);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRenamePage();
    }
  }

  async function handleTreeFocusOut(event) {
    const input = event.target.closest?.(".group-page-title-input");
    if (!input || !tree.contains(input)) return;
    await commitRenamePage(input.dataset.pageId, input.value);
  }

  async function removePage(pageId) {
    if (!pageId || !window.confirm?.("移除这个页面？")) return;

    const response = await sendMessage({
      type: MESSAGE_TYPES.DELETE_PAGE,
      payload: { pageId }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "已移除页面" : response?.message || "移除失败");
  }

  function openOptions() {
    sendMessage({ type: MESSAGE_TYPES.OPEN_OPTIONS });
  }

  function startDrag(event) {
    state.dragging = true;
    state.dragMoved = false;
    state.startX = event.clientX;
    state.startY = event.clientY;
    const rect = shell.getBoundingClientRect();
    state.startLeft = rect.left;
    state.startTop = rect.top;
    ball.setPointerCapture(event.pointerId);
    ball.addEventListener("pointermove", drag);
    ball.addEventListener("pointerup", stopDrag, { once: true });
  }

  function drag(event) {
    if (!state.dragging) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.dragMoved = true;
    shell.style.left = `${state.startLeft + dx}px`;
    shell.style.top = `${Math.max(8, state.startTop + dy)}px`;
    shell.style.right = "auto";
    shell.style.transform = "none";
  }

  function stopDrag(event) {
    state.dragging = false;
    ball.releasePointerCapture(event.pointerId);
    ball.removeEventListener("pointermove", drag);
    const position = snapToEdge();
    runSafely(saveBallPosition(position));
  }

  function snapToEdge() {
    const rect = shell.getBoundingClientRect();
    const offset = state.settings.edgeOffset ?? 12;
    const top = clampTop(rect.top, rect.height);
    let side = "right";
    if (rect.left + rect.width / 2 < window.innerWidth / 2) {
      side = "left";
      shell.dataset.side = "left";
      shell.style.left = `${offset}px`;
      shell.style.right = "auto";
    } else {
      side = "right";
      shell.dataset.side = "right";
      shell.style.right = `${offset}px`;
      shell.style.left = "auto";
    }
    shell.style.top = `${top}px`;
    return { side, top };
  }

  function clampTop(value, height = shell.getBoundingClientRect().height || 44) {
    const top = Number(value);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    if (!Number.isFinite(top)) return Math.min(maxTop, Math.max(8, window.innerHeight * 0.45));
    return Math.min(maxTop, Math.max(8, top));
  }

  async function saveBallPosition(ballPosition) {
    if (!ballPosition) return;
    state.settings = {
      ...state.settings,
      ballPosition
    };
    await sendMessage({
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      payload: { ballPosition }
    });
  }

  function handleInputKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      runSafely(saveCurrentPage());
    }
  }

  function handleSearchKeydown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const [firstGroup] = searchTree(state.data, searchInput.value);
    if (!firstGroup) {
      showToast("没有匹配分组");
      return;
    }
    runSafely(openGroup(firstGroup.id));
  }

  function handleDocumentPointerDown(event) {
    if (!state.isOpen) return;
    if (isEventInsideRoot(event)) {
      if (!event.target.closest?.(".group-add-popover, .group-add-group")) {
        addPopover.hidden = true;
      }
      return;
    }
    runSafely(togglePanel(false));
  }

  function isEventInsideRoot(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    if (Array.isArray(path)) return path.includes(root);
    return root.contains(event.target);
  }

  function flashBall() {
    ball.classList.add("group-ball-saved");
    window.setTimeout(() => ball.classList.remove("group-ball-saved"), 900);
  }

  function showToast(message) {
    window.clearTimeout(showToast.timer);
    toast.textContent = "";
    toast.hidden = true;
  }

  function searchTree(data, query) {
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    const value = String(query || "").trim().toLowerCase();
    if (!value) return groups;
    return groups.reduce((results, group) => {
      const groupMatches = group.name.toLowerCase().includes(value);
      const pages = groupMatches
        ? group.pages
        : group.pages.filter((page) =>
            [page.name, page.title, page.domain, page.url].some((field) =>
              String(field || "").toLowerCase().includes(value)
            )
          );
      if (groupMatches || pages.length) {
        results.push({ ...group, pages });
      }
      return results;
    }, []);
  }

  function getQuickAccessPages(data, limit = 5) {
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    return groups
      .flatMap((group) =>
        (Array.isArray(group.pages) ? group.pages : []).map((page) => ({
          ...page,
          groupId: group.id,
          groupName: group.name,
          groupIcon: group.icon,
          groupColor: group.color,
          openCount: normalizeOpenCount(page.openCount),
          quickAccessPinned: page.quickAccessPinned === true
        }))
      )
      .filter((page) => page.quickAccessPinned)
      .sort((left, right) => {
        if (left.openCount !== right.openCount) return right.openCount - left.openCount;
        return String(right.lastOpenedAt || "").localeCompare(String(left.lastOpenedAt || ""));
      })
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  function getPageDisplayName(page) {
    return page?.name || page?.title || page?.url || "";
  }

  function normalizeOpenCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.floor(number));
  }

  function getGroupIcon(group) {
    const icon = sanitizeIcon(group?.icon || group?.groupIcon);
    if (icon) return icon;
    return pickStable(DEFAULT_GROUP_ICONS, group?.id || group?.groupId || group?.name || group?.groupName);
  }

  function getGroupColor(group) {
    const color = sanitizeColor(group?.color || group?.groupColor);
    if (color) return color;
    return pickStable(DEFAULT_GROUP_COLORS, group?.id || group?.groupId || group?.name || group?.groupName);
  }

  function renderAddIcon() {
    return `
      <svg class="group-add-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14"></path>
        <path d="M5 12h14"></path>
      </svg>
    `;
  }

  function renderOpenAllIcon() {
    return `
      <svg class="group-open-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 8h10v10H8z"></path>
        <path d="M5 15V5h10"></path>
        <path d="M12 12h3v3"></path>
      </svg>
    `;
  }

  function renderOptionsIcon() {
    return `
      <svg class="group-options-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Z"></path>
        <path d="M18.2 13.1c.1-.4.1-.7.1-1.1s0-.8-.1-1.1l2-1.5-1.9-3.2-2.4 1a7.4 7.4 0 0 0-1.9-1.1L13.7 3h-3.4l-.4 3.1c-.7.3-1.3.7-1.9 1.1l-2.4-1-1.9 3.2 2 1.5c-.1.4-.1.7-.1 1.1s0 .8.1 1.1l-2 1.5 1.9 3.2 2.4-1c.6.5 1.2.8 1.9 1.1l.4 3.1h3.4l.4-3.1c.7-.3 1.3-.6 1.9-1.1l2.4 1 1.9-3.2-2.1-1.5Z"></path>
      </svg>
    `;
  }

  function renderSaveIcon() {
    return `
      <svg class="group-save-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h10a2 2 0 0 1 2 2v15l-7-4-7 4V6a2 2 0 0 1 2-2Z"></path>
        <path d="M12 8v6"></path>
        <path d="M9 11h6"></path>
      </svg>
    `;
  }

  function renderPinIcon(pinned) {
    return pinned
      ? `
        <svg class="group-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3l18 18"></path>
          <path d="M14 4l6 6"></path>
          <path d="M5 14l5 5"></path>
          <path d="M11 5l8 8-3 1-3 5-4-4"></path>
        </svg>
      `
      : `
        <svg class="group-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 4l6 6"></path>
          <path d="M11 5l8 8-5 1-4 6-2-6-6-2 6-4 3-3Z"></path>
          <path d="M7 17l-4 4"></path>
        </svg>
      `;
  }

  function renderRenameIcon() {
    return `
      <svg class="group-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path>
      </svg>
    `;
  }

  function renderTrashIcon() {
    return `
      <svg class="group-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16"></path>
        <path d="M9 7V5h6v2"></path>
        <path d="M7 7l1 13h8l1-13"></path>
        <path d="M10 11v5"></path>
        <path d="M14 11v5"></path>
      </svg>
    `;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        const runtime = globalThis.chrome?.runtime;
        if (!runtime?.sendMessage) {
          resolve(runtimeFailure(new Error("Extension context invalidated.")));
          return;
        }

        runtime.sendMessage(message, (response) => {
          try {
            const runtimeError = runtime.lastError;
            resolve(response || runtimeFailure(runtimeError));
          } catch (error) {
            resolve(runtimeFailure(error));
          }
        });
      } catch (error) {
        resolve(runtimeFailure(error));
      }
    });
  }

  function runtimeFailure(error) {
    const message = error?.message || String(error || "操作失败");
    if (/extension context invalidated/i.test(message)) {
      return {
        ok: false,
        reason: "context_invalidated",
        message: "插件刚刚刷新过，请刷新当前页面后继续使用"
      };
    }
    return { ok: false, reason: "runtime_error", message };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value ?? ""));
    return String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  }

  function sanitizeIcon(value) {
    return Array.from(String(value || "").trim()).slice(0, 4).join("");
  }

  function sanitizeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "";
  }

  function readableTextColor(color) {
    const hex = sanitizeColor(color);
    if (!hex) return "#172033";
    const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
    const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
    const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return luminance < 0.72 ? "#ffffff" : "#172033";
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

  function runSafely(promise) {
    Promise.resolve(promise).catch((error) => {
      showToast(error?.message || "group 操作失败");
    });
  }
})();
