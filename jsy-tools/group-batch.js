(() => {
  const singleton = Symbol.for("jsy-tools.group-batch");
  if (window[singleton]) return;
  window[singleton] = true;

  const regionSelector = '[data-test-type="analysis-group-region"][data-test-name="30000"]';
  const capsuleSelector = '[data-test-id="analysis-group-field"]';
  const sortDialogSelector = '[data-test-id="group-first-last-sort-dialog"]';
  const sortConfirmSelector = '[data-test-id="group-first-last-sort-confirm"]';
  const sortCancelSelector = '[data-test-id="group-first-last-sort-cancel"]';
  const dialogContentSelector = ".content-wrapper > .dialog-content";
  const dialogFooterButton = ".dialog-footer .footer-right .footer-btn";
  const sessions = new Map();
  let enabled = false;
  let frame = 0;

  function hostFiber(element) {
    if (!element) return;
    const key = Object.keys(element).find(name => name.startsWith("__reactFiber$"));
    return key && element[key];
  }

  // React retains the original host fiber on the DOM node across alternate commits.
  function committedPath(element) {
    const path = [];
    let fiber = hostFiber(element);
    while (fiber?.return) {
      path.push(fiber);
      fiber = fiber.return;
    }
    let current = fiber?.stateNode?.current;
    const props = [];
    for (const previous of path.reverse()) {
      let child = current?.child;
      while (child && child !== previous && child !== previous.alternate) child = child.sibling;
      if (!child) return [];
      props.push(child.memoizedProps);
      current = child;
    }
    return props.reverse().filter(Boolean);
  }

  function labelText(label) {
    if (Array.isArray(label)) return label.map(labelText).join("");
    if (typeof label === "string" || typeof label === "number") return String(label);
    return label?.props ? labelText(label.props.children) : "";
  }

  function methods(items, result = new Map()) {
    for (const item of items) {
      if (item.disabled) continue;
      if (item.children?.length) {
        methods(item.children, result);
      } else if (item.icon?.props?.name === "jsy-icon-font-dot") {
        // Concatenation and custom percentile require additional parameters.
        if (item.key === 5 || item.key === 66) continue;
        const label = labelText(item.label);
        if (label) result.set(item.key > 0 && item.key < 1 ? label + "% 分位" : label, item.key);
      }
    }
    return result;
  }

  function readItem(node) {
    const trigger = node.lastElementChild;
    const path = committedPath(trigger?.querySelector("svg") || trigger);
    const menu = path.find(props => Array.isArray(props.menu?.items))?.menu;
    const combo = path.find(props => typeof props.handleValue === "function" && props.regionType === "30000");
    const legacy = path.find(props => typeof props.onFirstLastConfirm === "function");
    const env = path.find(props => props.value?.actions?.setFunction)?.value;
    const key = legacy ? path.find(props => props.dId)?.dId : node.dataset.testItemKey ||
      path.find(props => props.itemKey && props.region === "30000")?.itemKey;
    if (!menu || !combo || !key || (!legacy && !env)) return null;
    const source = legacy ? legacy.dimension.id : node.dataset.testSourceField ||
      env.model?.config?.measures?.[env.model.measureKeys?.indexOf(key)]?.field;
    return {
      node, key, source, methods: methods(menu.items), openSort: combo.handleValue,
      apply(value) {
        if (value !== 57 && value !== 58) return combo.handleValue(value);
        if (legacy) {
          legacy.onFirstLastConfirm([{ type: 1, value }], [{ id: source, sortType: 1 }]);
        } else {
          const sorts = source && source !== "__ROW_NUMBER__" ? [{ field: source, sortType: 1 }] : [];
          env.actions.setFunction(key, { type: value === 57 ? 10 : 11, sorts });
        }
      },
    };
  }

  function button(text, action) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = text;
    el.className = "jsy-batch-action";
    el.onclick = action;
    return el;
  }

  function readSortPanel(region) {
    const path = committedPath(region);
    const env = path.find(props => props.value?.actions?.setFunction)?.value;
    if (env) {
      const host = path.find(props => props.store === env.store && typeof props.onConfigChange === "function");
      const state = env.store?.getState?.();
      const config = host?.config;
      const keys = env.model?.measureKeys;
      if (!state || state.readOnly || !env.stepId || !Array.isArray(config?.measures) || keys?.length !== config.measures.length) return null;
      const items = new Map();
      // V2 uses AggregateFunctionType; first/last store sorts and concatenation stores orders.
      config.measures.forEach((item, index) => {
        const mode = item.function?.type;
        if ([10, 11, 12].includes(mode)) items.set(keys[index], { item, menuKey: mode === 12 ? 5 : mode === 10 ? 57 : 58 });
      });
      return {
        scope: [env.store, env.projectId, state.tableId, state.selectId, env.stepId],
        items,
        apply(selected, rules) {
          const measures = config.measures.map((item, index) => {
            if (!selected.has(keys[index])) return item;
            const orderKey = item.function.type === 12 ? "orders" : "sorts";
            const orders = rules.filter(rule => rule.id !== "__ROW_NUMBER__").map(({ id, sortType, values }) => ({
              field: id, sortType, ...(sortType === 3 && values?.length ? { customValues: [...values] } : {}),
            }));
            return { ...item, function: { ...item.function, [orderKey]: orders } };
          });
          host.onConfigChange({ ...config, measures });
        },
      };
    }

    const store = path.find(props => typeof props.value?.getState === "function" && props.value.getState()?.sourceProps)?.value;
    const state = store?.getState();
    const source = state?.sourceProps;
    const stepId = source?.operators?.[source.selected]?.id;
    const ids = source?.view?.["30000"];
    if (!stepId || !Array.isArray(ids) || !source.dimensions || typeof store.setState !== "function" ||
        typeof state.triggerRefresh !== "function") return null;
    const items = new Map();
    // V1 uses group menu values and stores sorting directly on each existing dimension.
    for (const id of ids) {
      const item = source.dimensions[id];
      const menuKey = item?.value?.[0]?.value;
      if ([57, 58, 5].includes(menuKey)) items.set(id, { item, menuKey });
    }
    return {
      scope: [store, source.activeProject, source.name, stepId, source.subSelected],
      items,
      apply(selected, rules) {
        const dimensions = { ...source.dimensions };
        for (const id of selected) {
          const sort = rules.map(rule => ({ ...rule, ...(rule.values && { values: [...rule.values] }) }));
          dimensions[id] = { ...dimensions[id], sort };
        }
        store.setState({ sourceProps: { ...source, dimensions } });
        state.triggerRefresh();
      },
    };
  }

  function nativeSortSeed(targets, panel) {
    for (const target of targets) {
      const key = panel.items.get(target.key)?.menuKey;
      if ((key === 57 || key === 58) && [...target.methods.values()].includes(key)) return () => target.openSort(key);
    }
    // Concatenation uses the same sort editor. Open it without exposing the delimiter controls.
    const target = targets.find(item => [...item.methods.values()].includes(57));
    return target && (() => target.openSort(57));
  }

  function sortDialogCandidates() {
    return new Set([...document.querySelectorAll(`${sortDialogSelector}, ${dialogContentSelector}`)].map(node =>
      node.matches(sortDialogSelector) ? node : node.parentElement.parentElement));
  }

  function nativeSortProps(path) {
    return path.find(props => typeof props.onOk === "function" &&
      typeof props.children?.props?.updateSortValues === "function" &&
      Array.isArray(props.children.props.sortValues));
  }

  function reactRoot(element) {
    let fiber = hostFiber(element);
    while (fiber?.return) fiber = fiber.return;
    return fiber?.stateNode?.containerInfo;
  }

  function openSortDialog(region, panel, selected, openNative, onClose, onStatus, onDraft) {
    const existingRoots = new Set(document.body.children);
    const existingDialogs = sortDialogCandidates();
    const url = location.href;
    // Refresh copies the configuration. Compare its contents instead of its object identity.
    const initialItems = new Map([...selected].map(key => [key, JSON.stringify(panel.items.get(key)?.item)]));
    const observer = new MutationObserver(trackDialog);
    let dialog;
    let roots = [];
    let discoveryTimer;
    let cancelNative;
    let closing;
    let closeRequested = false;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(discoveryTimer);
      observer.disconnect();
      document.removeEventListener("click", interceptDialog, true);
      onClose();
    }

    function trackDialog() {
      if (dialog) {
        if (!dialog.isConnected) finish();
        return;
      }
      if (roots.length && roots.every(root => !root.isConnected)) return finish();
      const candidates = [...sortDialogCandidates()].filter(node => !existingDialogs.has(node) &&
        (!roots.length || roots.includes(reactRoot(node))) &&
        (node.matches(sortDialogSelector) || nativeSortProps(committedPath(node))));
      if (candidates.length !== 1) return;
      [dialog] = candidates;
      clearTimeout(discoveryTimer);
      cancelNative = committedPath(dialog).find(props => Array.isArray(props.sortValues) &&
        typeof props.onOk === "function" && typeof props.onCancel === "function")?.onCancel;
      const title = dialog.querySelector(".dialog-title .main-title");
      if (title) title.textContent = `批量设置组内排序（${selected.size} 项）`;
      const footer = dialog.querySelector(".footer-left");
      if (footer) {
        const hint = document.createElement("span");
        hint.textContent = "确定后在批量工具栏点击「应用」";
        footer.append(hint);
      }
      if (closeRequested) void close();
    }

    function close() {
      closeRequested = true;
      if (!dialog || finished) return closing;
      closing ||= Promise.resolve().then(() => {
        if (cancelNative) return cancelNative();
        const cancel = dialog.querySelector(sortCancelSelector) || footerButtons().find(control => !isConfirm(control));
        cancel?.click();
      }).then(() => {
        finish();
        return true;
      }, error => {
        console.error("[jsy-tools] 关闭排序弹窗失败", error);
        closing = null;
        closeRequested = false;
        if (dialog.isConnected) message("排序弹窗未能关闭，请重试。");
        else onStatus("排序弹窗未能关闭，请重试。", true);
        return false;
      });
      return closing;
    }

    function message(text) {
      const footer = dialog.querySelector(".footer-left") || dialog;
      let status = footer.querySelector(".jsy-batch-sort-status");
      if (!status) {
        status = document.createElement("span");
        status.className = "jsy-batch-sort-status";
        status.setAttribute("role", "alert");
        footer.append(status);
      }
      status.textContent = text;
    }

    function currentPanel() {
      const current = region.isConnected && url === location.href ? readSortPanel(region) : null;
      if (!current || panel.scope.some((value, index) => value !== current.scope[index]) ||
          [...initialItems].some(([key, initial]) => JSON.stringify(current.items.get(key)?.item) !== initial)) return null;
      return current;
    }

    function footerButtons() {
      return [...dialog.querySelectorAll(dialogFooterButton)];
    }

    function isConfirm(control) {
      if (control.matches(sortConfirmSelector)) return true;
      if (!footerButtons().includes(control)) return false;
      // Older Fine Design dialogs don't expose test IDs. Their Confirm button receives Dialog.onOk directly.
      const path = committedPath(control);
      const native = nativeSortProps(path);
      return Boolean(native && path.some(props => props.onClick === native.onOk));
    }

    async function confirmRules(control) {
      if (!currentPanel()) {
        message("当前步骤或汇总项已变化，请重新打开排序设置。");
        return;
      }
      const nativeDialog = nativeSortProps(committedPath(control));
      const rules = nativeDialog?.children.props.sortValues;
      if (!Array.isArray(rules)) {
        message("无法读取九数云的排序规则，请重新打开排序设置。");
        return;
      }
      const draft = rules.filter(rule => rule.id).map(rule => ({ ...rule, ...(rule.values && { values: [...rule.values] }) }));
      if (await close()) onDraft({ selected, rules: draft, currentPanel });
    }

    function interceptDialog(event) {
      const control = event.target.closest?.(`${sortConfirmSelector}, ${sortCancelSelector}, ${dialogFooterButton}, .dialog-header .close-btn`);
      if (!control) return;
      if (!dialog) trackDialog();
      if (!dialog?.contains(control)) return;
      if (control.matches(".close-btn") && control !== dialog.querySelector(".dialog-header .close-btn")) return;
      const confirm = isConfirm(control);
      const cancel = control.matches(`${sortCancelSelector}, .close-btn`) ||
        (footerButtons().length === 2 && footerButtons().indexOf(control) === 0);
      if (!confirm && !cancel) return;
      // Let the native cancel button handle the fallback when there is no lifecycle callback.
      if (!confirm && !cancelNative) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (closeRequested) return;
      if (confirm) void confirmRules(control);
      else void close();
    }

    try {
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("click", interceptDialog, true);
      openNative();
      roots = [...document.body.children].filter(node => !existingRoots.has(node) &&
        Object.keys(node).some(key => key.startsWith("__reactContainer$")));
      if (!roots.length) {
        discoveryTimer = setTimeout(() => {
          finish();
          onStatus("未能打开批量排序弹窗，请重试。", true);
        }, 4000);
      }
      trackDialog();
      return { close };
    } catch (error) {
      if (dialog) close();
      else finish();
      console.error("[jsy-tools] 无法打开九数云的排序弹窗", error);
      onStatus("未能打开批量排序弹窗，请重试。", true);
      return null;
    }
  }

  function mount(region, footer, panel) {
    let active = false;
    let step;
    let fieldPanel;
    let sortDialog;
    let draft;
    let unsubscribe;
    let previousFields = new Set();
    const selected = new Set();
    const markers = new Map();
    const capsules = () => [...region.querySelectorAll(capsuleSelector)];
    const items = (nodes = capsules()) => nodes.map(readItem).filter(Boolean);
    const stepContext = () => {
      const path = committedPath(region);
      const env = path.find(p => p.value?.actions?.setFunction)?.value;
      if (env) return { id: env.stepId, store: env.store };
      const store = path.find(p => typeof p.value?.getState === "function" && p.value.getState()?.sourceProps)?.value;
      const props = store?.getState()?.sourceProps;
      return { id: props?.operators?.[props.selected]?.id, store };
    };
    const entry = button("批量设置", () => {
      const context = stepContext();
      fieldPanel = panel.previousElementSibling;
      fieldPanel?.addEventListener("click", schedule, true);
      active = true;
      step = context.id;
      unsubscribe = context.store?.subscribe?.(schedule);
      render();
    });
    footer.prepend(entry);
    const toolbar = document.createElement("div");
    toolbar.className = "jsy-batch-toolbar";
    const allLabel = document.createElement("label");
    const all = document.createElement("input");
    all.type = "checkbox";
    all.className = "jsy-batch-check";
    allLabel.append(all, "全选");
    all.onchange = () => {
      selected.clear();
      if (all.checked) for (const item of items()) if (item.methods.size) selected.add(item.key);
      render();
    };
    const select = document.createElement("select");
    select.setAttribute("aria-label", "统一汇总方式");
    const picker = document.createElement("span");
    picker.className = "jsy-batch-picker";
    picker.append(select);
    select.onchange = () => {
      const targets = items().filter(item => selected.has(item.key));
      const method = select.value;
      if (method && targets.length === selected.size && targets.every(item => item.methods.has(method))) {
        draft = null;
        for (const item of targets) item.apply(item.methods.get(method));
      }
      select.selectedIndex = 0;
      render();
    };
    const sortStatus = document.createElement("span");
    sortStatus.setAttribute("role", "status");
    function reportSort(text, error = false) {
      if (!active) return;
      sortStatus.classList.toggle("jsy-batch-sort-status", error);
      sortStatus.textContent = text;
    }
    const sort = button("设置排序", () => {
      const panel = readSortPanel(region);
      if (sortDialog || !panel || !selected.size || [...selected].some(key => !panel.items.has(key))) return;
      const seed = nativeSortSeed(items().filter(item => selected.has(item.key)), panel);
      if (!seed) return;
      sortStatus.textContent = "";
      sortDialog = openSortDialog(region, panel, new Set(selected), seed, () => {
        sortDialog = null;
        if (active) schedule();
      }, reportSort, next => {
        if (!active) return;
        draft = next;
        render();
      });
    });
    const applySort = button("应用", () => {
      if (!draft || sortDialog) return;
      const current = draft.currentPanel();
      if (!current) {
        draft = null;
        render();
        reportSort("当前步骤或汇总项已变化，请重新设置排序。", true);
        return;
      }
      try {
        current.apply(draft.selected, draft.rules);
        exit();
      } catch (error) {
        console.error("[jsy-tools] 批量设置排序失败", error);
        reportSort("无法应用排序，请检查当前步骤。", true);
      }
    });
    applySort.classList.add("jsy-batch-apply");
    toolbar.append(allLabel, picker, sort, applySort, button("退出批量", exit), sortStatus);

    function exit() {
      active = false;
      sortDialog?.close();
      unsubscribe?.();
      unsubscribe = null;
      fieldPanel?.removeEventListener("click", schedule, true);
      previousFields.clear();
      selected.clear();
      draft = null;
      sortStatus.textContent = "";
      toolbar.remove();
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      entry.hidden = false;
    }

    function render() {
      if (!active) return;
      const context = stepContext();
      if (context.id && step && context.id !== step) return exit();
      step ||= context.id;
      const nodes = capsules();
      const current = items(nodes);
      const available = current.filter(item => item.methods.size);
      // Older editors expose only the search control inside GroupFieldList.
      const anchor = fieldPanel?.querySelector('[data-test-id="group-field-list"], [data-test-id="group-field-list-search"]');
      const fields = committedPath(anchor).find(p => Array.isArray(p.selectedFieldIds))?.selectedFieldIds;
      if (fields) {
        const nextFields = new Set(fields);
        for (const item of available) {
          const chosen = nextFields.has(item.source);
          if (chosen === previousFields.has(item.source)) continue;
          if (chosen) selected.add(item.key);
          else selected.delete(item.key);
        }
        previousFields = nextFields;
      }
      const keys = new Set(available.map(item => item.key));
      // Some controls can be temporarily unreadable while the preview refreshes.
      if (current.length === nodes.length) {
        for (const key of selected) if (!keys.has(key)) selected.delete(key);
      }
      for (const [node, marker] of markers) {
        if (!region.contains(node)) {
          marker.remove();
          markers.delete(node);
        }
      }
      for (const item of current) {
        let marker = markers.get(item.node);
        if (!marker) {
          marker = document.createElement("input");
          marker.type = "checkbox";
          marker.className = "jsy-batch-check";
          markers.set(item.node, marker);
          item.node.prepend(marker);
        }
        marker.setAttribute("aria-label", item.node.dataset.testName || item.source);
        marker.disabled = !item.methods.size;
        marker.checked = selected.has(item.key);
      }
      entry.hidden = true;
      if (!toolbar.isConnected) region.before(toolbar);
      all.checked = keys.size > 0 && selected.size === keys.size;
      all.indeterminate = selected.size > 0 && !all.checked;
      all.disabled = !keys.size;
      const targets = available.filter(item => selected.has(item.key));
      const complete = targets.length > 0 && targets.length === selected.size;
      const common = complete ? [...targets[0].methods.keys()].filter(name => targets.every(item => item.methods.has(name))) : [];
      if (JSON.stringify(common) !== select.dataset.methods) {
        select.replaceChildren(new Option("统一汇总方式", ""), ...common.map(name => new Option(name, name)));
        select.dataset.methods = JSON.stringify(common);
      }
      select.disabled = !common.length;
      const sortPanel = complete ? readSortPanel(region) : null;
      sort.disabled = !sortPanel || targets.some(item => !sortPanel.items.has(item.key)) || !nativeSortSeed(targets, sortPanel);
      sort.title = "支持第一项、最后一项和拼接，请仅勾选这些汇总项";
      if (draft && (draft.selected.size !== selected.size || [...draft.selected].some(key => !selected.has(key)))) {
        draft = null;
        reportSort("勾选项已变化，请重新设置排序。");
      }
      applySort.disabled = !draft || !sortPanel;
      applySort.textContent = draft ? `应用到 ${draft.selected.size} 项` : "应用";
    }

    function intercept(event) {
      if (!active) return;
      const node = event.target.closest?.(capsuleSelector);
      if (!node || !region.contains(node)) return;
      event.stopImmediatePropagation();
      if (event.type !== "click") {
        if (event.type === "dragstart") event.preventDefault();
        return;
      }
      const item = readItem(node);
      if (item?.methods.size) {
        if (selected.has(item.key)) selected.delete(item.key);
        else selected.add(item.key);
      }
      render();
    }
    const events = ["pointerdown", "mousedown", "dragstart", "click", "dblclick"];
    for (const name of events) region.addEventListener(name, intercept, true);
    return { entry, render, remove() {
      exit();
      entry.remove();
      for (const name of events) region.removeEventListener(name, intercept, true);
    } };
  }

  function sync() {
    frame = 0;
    const route = /^\/decision\/home\/project\/[^/]+\/analysis\/[^/]+/.test(location.pathname);
    const regions = new Set(enabled && route ? document.querySelectorAll(regionSelector) : []);
    if (enabled && route) {
      // Earlier GroupRegion versions identify only the summary-specific clear-name button.
      for (const clear of document.querySelectorAll('[data-test-id="analysis-group-clear-summary-name"]')) {
        const region = clear.closest(regionSelector) || clear.closest(".operator-region-panel > div");
        if (region) regions.add(region);
      }
    }
    for (const [region, session] of sessions) {
      if (!regions.has(region) || !session.entry.isConnected) {
        session.remove();
        sessions.delete(region);
      }
    }
    for (const region of regions) {
      if (!sessions.has(region)) {
        const panel = region.parentElement.closest(".operator-region-panel")?.parentElement;
        const toggle = panel?.querySelector('[data-test-id="group-merge-previous-toggle"]');
        const footer = toggle?.closest(".ml-auto");
        if (footer) sessions.set(region, mount(region, footer, panel));
      }
      sessions.get(region)?.render();
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }
  const observer = new MutationObserver(schedule);
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "jsy-tools" || event.data.type !== "settings") return;
    const next = event.data.groupBatchEnabled === true;
    if (enabled === next) return;
    enabled = next;
    if (enabled) observer.observe(document, { childList: true, subtree: true, characterData: true });
    else observer.disconnect();
    sync();
  });
  window.postMessage({ channel: "jsy-tools", type: "ready" }, location.origin);
})();
