(() => {
  const singleton = Symbol.for("claire.jsy-tools.recent-actions");
  if (window[singleton]) return;
  window[singleton] = true;

  const groupKeys = new Set([13, 14, 15, 16, 17, 25]);
  const confirmingKeys = new Set([8, 74]);
  const bars = new Map();
  let enabled = false;
  let recent = [];
  let scheduled = false;
  let replaying = false;
  const iconTags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "use"]);
  const iconAttributes = new Set(["viewBox", "d", "x", "y", "x1", "x2", "y1", "y2", "width", "height", "rx", "ry", "r", "cx", "cy", "points", "fill", "fill-opacity", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "transform", "href", "xlink:href"]);

  function iconData(element, budget = { remaining: 100 }) {
    if (!element || !iconTags.has(element.localName) || --budget.remaining < 0) return null;
    const attributes = {};
    for (const attr of element.attributes) {
      if (iconAttributes.has(attr.name) && attr.value.length <= 16000 &&
          !/url\s*\(/i.test(attr.value) && (!attr.name.endsWith("href") || /^#[\w-]+$/.test(attr.value))) attributes[attr.name] = attr.value;
    }
    return { tag: element.localName, attributes, children: Array.from(element.children).map(child => iconData(child, budget)).filter(Boolean) };
  }

  function makeIcon(data, budget = { remaining: 100 }) {
    if (!data || !iconTags.has(data.tag) || --budget.remaining < 0) return null;
    const element = document.createElementNS("http://www.w3.org/2000/svg", data.tag);
    for (const [name, value] of Object.entries(data.attributes || {})) {
      if (iconAttributes.has(name) && typeof value === "string" && value.length <= 16000 &&
          !/url\s*\(/i.test(value) && (!name.endsWith("href") || /^#[\w-]+$/.test(value))) {
        element.setAttribute(name === "xlink:href" ? "href" : name, value);
      }
    }
    for (const child of Array.isArray(data.children) ? data.children : []) {
      const node = makeIcon(child, budget);
      if (node) element.append(node);
    }
    return element;
  }

  function buttonTemplates(fiber) {
    // Tools 在 body 中另有测量用 Portal，包含未在顶栏显示的完整按钮与多色图标。
    return Array.from(document.querySelectorAll(".measure-item button, .tool-item button"))
      .filter(button => !button.closest("[data-jsy-recent-bar]") && sameReactRoot(button, fiber));
  }

  function nativeButton(container, action, fiber, originals = buttonTemplates(fiber)) {
    const matching = originals.find(button => button.textContent.trim() === action.label);
    const template = matching || originals[0];
    const button = template ? template.cloneNode(false) : document.createElement("button");
    for (const attr of Array.from(button.attributes)) {
      if (attr.name === "id" || attr.name.startsWith("data-") || attr.name.startsWith("aria-")) button.removeAttribute(attr.name);
    }
    button.disabled = false;
    const group = originals.find(button => button.textContent.trim() === action.groupLabel);
    const sourceIcon = (matching || group)?.querySelector("svg");
    // 多色图形直接随插件打包，避免菜单的单色缓存、Portal 挂载时序和主题变量缺失影响颜色。
    const bundled = window[Symbol.for("claire.jsy-tools.toolbar-icons")]?.[action.key];
    const icon = makeIcon(bundled) || sourceIcon?.cloneNode(true) || makeIcon(action.cachedIcon);
    if (icon?.localName === "svg") {
      icon.setAttribute("aria-hidden", "true");
      icon.style.cssText = "display:block;width:16px;height:16px;flex:none;color:var(--color-primary, #00b5a5)";
      button.append(icon);
    }
    const label = document.createElement("span");
    label.textContent = action.label;
    button.append(label);
    if (template) {
      const style = getComputedStyle(template);
      for (const name of ["font-family", "font-size", "font-weight", "line-height", "padding-top", "padding-right", "padding-bottom", "padding-left"]) {
        button.style.setProperty(name, style.getPropertyValue(name));
      }
    } else button.style.cssText = "border:0;background:transparent;color:inherit;font:inherit;padding:6px 8px;cursor:pointer";
    button.style.cssText += ";display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;flex:none;white-space:nowrap";
    return button;
  }

  function inProject() {
    return /^\/decision\/home\/project\/[^/]+(?:\/|$)/.test(location.pathname);
  }

  function walk(root, predicate) {
    const stack = [root];
    const seen = new Set();
    while (stack.length && seen.size < 30000) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      if (predicate(node)) return node;
      if (node.sibling) stack.push(node.sibling);
      if (node.child) stack.push(node.child);
    }
    return null;
  }

  // shortcut: 沿用页面 React 内部结构读取菜单与回调；无法识别时保留原工具栏，产品升级后再适配。
  function toolsFiber(container) {
    for (const element of [container, ...container.querySelectorAll("*")]) {
      const key = Object.keys(element).find(name => name.startsWith("__reactContainer$") || name.startsWith("__reactFiber$"));
      if (!key) continue;
      let root = element[key];
      while (root.return) root = root.return;
      root = root.stateNode?.current || root;
      const tools = walk(root, node => {
        const props = node.memoizedProps;
        return Array.isArray(props?.excludeOperators) && typeof props.onItemClick === "function" &&
          typeof props.disabled === "boolean" && "warningTitle" in props;
      });
      if (tools) return tools;
    }
    return null;
  }

  function historyMenu(container) {
    const scope = container.closest(".hd-conf-analysis");
    const trigger = scope?.querySelector('[data-test-type="analysis-history-add-trigger"][data-test-name="history-flow-big-add"]');
    const key = trigger && Object.keys(trigger).find(name => name.startsWith("__reactFiber$"));
    let node = key && trigger[key];
    while (node) {
      const props = node.memoizedProps;
      if (props?.content?.props?.["data-test-id"] === "analysis-history-add-menu" &&
          Array.isArray(props.content.props.items) && typeof props.onVisibleChange === "function") {
        return { fiber: node, props, disabled: trigger.getAttribute("data-test-disabled") === "true" ||
          Boolean(trigger.querySelector('[data-test-disabled="true"]')) };
      }
      node = node.return;
    }
    return null;
  }

  function isChartEditor(container) {
    const header = container.closest('[data-test-id="analysis-editor-header"]');
    if (!header) return false;
    for (const element of header.querySelectorAll("*")) {
      const key = Object.keys(element).find(name => name.startsWith("__reactContainer$") || name.startsWith("__reactFiber$"));
      if (!key) continue;
      let root = element[key];
      while (root.return) root = root.return;
      root = root.stateNode?.current || root;
      // ToolbarRight 的 props 只在初始化时写入，切换图表后的状态保存在 Context store。
      const provider = walk(root, node => typeof node.memoizedProps?.value?.useToolbarRightStore?.getState === "function");
      if (provider) return provider.memoizedProps.value.useToolbarRightStore.getState().stepType === "ChartStep";
      const toolbar = walk(root, node => typeof node.memoizedProps?.selectedWidget === "string" &&
        typeof node.memoizedProps?.disableQuickOperator === "boolean" && "stepType" in node.memoizedProps);
      if (toolbar) return toolbar.memoizedProps.stepType === "ChartStep";
    }
    return false;
  }

  function showInChart(container, state, chart) {
    const header = container.closest('[data-test-id="analysis-editor-header"]');
    if (chart && header) {
      if (!state.chartHeader) {
        state.chartHeader = header;
        state.headerPosition = header.style.position;
        state.hostStyle = state.host.style.cssText;
        if (getComputedStyle(header).position === "static") header.style.position = "relative";
        // 图表态原 QuickOperator 及其布局包装可能隐藏，直接挂到可见的标题栏。
        header.append(state.host);
        state.resize.observe(header);
      }
      const bounds = header.getBoundingClientRect();
      const right = header.querySelector(".analysis-toolbar-right")?.closest(".bi-right") ||
        header.querySelector(".analysis-toolbar-right");
      const rightEdge = right?.getBoundingClientRect().left ?? bounds.right;
      const width = Math.max(0, rightEdge - bounds.left - 16);
      state.host.style.cssText = state.hostStyle + `;position:absolute;left:8px;top:0;height:100%;width:${width}px;z-index:1`;
    } else if (state.chartHeader) {
      state.resize.unobserve(state.chartHeader);
      state.chartHeader.style.position = state.headerPosition;
      container.append(state.host);
      state.host.style.cssText = state.hostStyle;
      state.chartHeader = null;
    }
  }

  function labelText(label) {
    if (typeof label === "string" || typeof label === "number") return String(label);
    if (Array.isArray(label)) return label.map(labelText).join("");
    return label?.props ? labelText(label.props.children) : "";
  }

  function catalog(fiber, container) {
    const result = new Map();
    function collect(items, disabled = false, groupLabel, fromHistory = false) {
      for (const item of items) {
        if (!item || !Number.isInteger(item.key)) continue;
        if (Array.isArray(item.children)) collect(item.children, disabled || item.disabled, item.key === 25 ? groupLabel : labelText(item.label), fromHistory);
        else if (labelText(item.label) && !groupKeys.has(item.key) && (!fromHistory || !result.has(item.key))) {
          result.set(item.key, { key: item.key, label: labelText(item.label), groupLabel, disabled: disabled || Boolean(item.disabled), fromHistory });
        }
      }
    }
    let hook = fiber.memoizedState;
    for (let i = 0; hook && i < 100; i++, hook = hook.next) {
      const value = hook.memoizedState;
      if (Array.isArray(value) && Array.isArray(value[0])) collect(value[0]);
    }
    const menu = container && historyMenu(container);
    if (menu) collect(menu.props.content.props.items, menu.disabled, undefined, true);
    return result;
  }

  function remember(action) {
    if (!enabled || !inProject() || groupKeys.has(action.key)) return;
    window.postMessage({ channel: "jsy-tools", type: "recent-action", action: { key: action.key, label: action.label, icon: action.cachedIcon } }, location.origin);
  }

  function restore(container, state) {
    showInChart(container, state, false);
    state.resize.disconnect();
    state.host.remove();
    for (const [element, previous] of state.originals) {
      element.style.cssText = previous.style;
      element.inert = previous.inert;
    }
    container.style.position = state.position;
    bars.delete(container);
  }

  function fit(state) {
    let remaining = state.host.clientWidth;
    let overflow = false;
    for (const button of state.host.children) {
      button.hidden = false;
      const width = button.getBoundingClientRect().width;
      if (overflow || width > remaining) {
        button.hidden = true;
        overflow = true;
      } else remaining -= width + 8;
    }
  }

  function mount(container) {
    const host = document.createElement("div");
    host.dataset.jsyRecentBar = "";
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "最近操作快捷栏");
    const height = Math.max(32, container.getBoundingClientRect().height);
    host.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:nowrap;overflow:hidden;width:100%;min-width:0;height:${height}px`;
    const resize = new ResizeObserver(() => fit(state));
    const state = { host, resize, originals: new Map(), position: container.style.position, signature: "" };
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.append(host);
    resize.observe(host);
    bars.set(container, state);
    return state;
  }

  function concealOriginals(container, state) {
    for (const element of container.children) {
      if (element === state.host || state.originals.has(element)) continue;
      state.originals.set(element, { style: element.style.cssText, inert: element.inert });
      // React 外层是 display:contents；先生成布局盒，绝对定位才能消除原按钮的占位。
      element.style.cssText += ";display:block!important;position:absolute!important;inset:0!important;visibility:hidden!important;pointer-events:none!important";
      element.inert = true;
    }
  }

  function hasKey(items, key) {
    return Array.isArray(items) && items.some(item => item?.key === key || hasKey(item?.children, key));
  }

  function sameReactRoot(element, fiber) {
    const key = Object.keys(element).find(name => name.startsWith("__reactFiber$"));
    let current = key && element[key];
    if (!current) return false;
    while (current.return) current = current.return;
    while (fiber.return) fiber = fiber.return;
    return current.stateNode === fiber.stateNode;
  }

  async function replayConfirmation(fiber, key, container, fromHistory = false) {
    // 这些菜单项有原生确认弹窗：展开原菜单并选择原项，保留确认/取消与保存逻辑。
    const popover = fromHistory ? historyMenu(container)?.fiber : walk(fiber.child, node => {
      const props = node.memoizedProps;
      return props?.content?.props?.["data-test-id"] === "analysis-history-add-menu" &&
        hasKey(props.content.props.items, key) && typeof props.onVisibleChange === "function";
    });
    if (!popover) throw new Error("未找到原操作的确认入口，请从原 + 菜单操作");
    popover.memoizedProps.onVisibleChange(true);
    const project = location.pathname;
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!enabled || location.pathname !== project || !container.isConnected) return;
      const items = document.querySelectorAll(`[data-test-type="analysis-history-add-option"][data-test-name="${key}"]`);
      const item = Array.from(items).find(element => sameReactRoot(element, popover) &&
        element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
      if (item) { item.click(); return; }
    }
    popover.memoizedProps.onVisibleChange(false);
    throw new Error("原菜单尚未就绪，请从原 + 菜单操作");
  }

  async function activate(container, key) {
    if (!enabled || !inProject() || replaying) return;
    const fiber = toolsFiber(container);
    const action = fiber && catalog(fiber, container).get(key);
    if (!action || action.disabled || fiber.memoizedProps.disabled) { schedule(); return; }
    replaying = true;
    try {
      if (confirmingKeys.has(key)) await replayConfirmation(fiber, key, container, action.fromHistory);
      else if (action.fromHistory) {
        const menu = historyMenu(container);
        const onAfterSelect = menu?.props.content.props.onAfterSelect;
        if (menu?.disabled || typeof onAfterSelect !== "function") throw new Error("未找到原操作的菜单入口，请从原 + 菜单操作");
        // 嵌套菜单项可能尚未挂载，沿用原菜单的选择回调完成建步。
        await onAfterSelect({ key });
        remember(action);
      }
      else {
        // QuickOperator 的现有回调负责类型转换、插入位置和打开配置窗。
        await fiber.memoizedProps.onItemClick(key);
        remember(action);
      }
    } catch (error) {
      console.error("[jsy-tools] 最近操作执行失败", action.label, error);
    } finally { replaying = false; schedule(); }
  }

  function update() {
    scheduled = false;
    for (const [container, state] of bars) {
      if (!enabled || !inProject() || !container.isConnected) restore(container, state);
    }
    if (!enabled || !inProject()) return;
    for (const container of document.querySelectorAll(".hd-analysis-quick-operator")) {
      const fiber = toolsFiber(container);
      const actions = fiber && catalog(fiber, container);
      if (!actions?.size) {
        if (bars.has(container)) restore(container, bars.get(container));
        continue;
      }
      const state = bars.get(container) || mount(container);
      showInChart(container, state, isChartEditor(container));
      concealOriginals(container, state);
      const items = recent.map(item => actions.has(item.key) ? { ...actions.get(item.key), cachedIcon: item.icon } : null).filter(Boolean);
      const templates = buttonTemplates(fiber);
      const templateSignature = templates.map(button => [button.textContent.trim(), button.className, button.getAttribute("style"), button.querySelector("svg")?.outerHTML]);
      const signature = JSON.stringify([items, fiber.memoizedProps.disabled, fiber.memoizedProps.warningTitle, templateSignature]);
      if (signature !== state.signature) {
        state.signature = signature;
        const focusedKey = state.host.contains(document.activeElement) ? document.activeElement.dataset.actionKey : null;
        const buttons = items.map(action => {
          const button = nativeButton(container, action, fiber, templates);
          button.type = "button";
          button.dataset.actionKey = String(action.key);
          const disabled = action.disabled || fiber.memoizedProps.disabled;
          button.setAttribute("aria-disabled", String(disabled));
          button.title = disabled ? fiber.memoizedProps.warningTitle || "当前步骤不可使用此操作" : action.label;
          if (disabled) button.style.cssText += ";opacity:.45;cursor:not-allowed";
          button.addEventListener("click", () => { if (!disabled) void activate(container, action.key); });
          return button;
        });
        state.host.replaceChildren(...buttons);
        fit(state);
        if (focusedKey) Array.from(state.host.children).find(button => button.dataset.actionKey === focusedKey && !button.hidden)?.focus({ preventScroll: true });
      } else fit(state);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }

  function clickedMenuAction(target) {
    for (let element = target; element; element = element.parentElement) {
      const key = Object.keys(element).find(name => name.startsWith("__reactFiber$"));
      let node = key && element[key];
      let item;
      while (node) {
        const props = node.memoizedProps;
        if (!item && Number.isInteger(props?.item?.key) && typeof props.onAfterSelect === "function") item = props.item;
        if (item && (props?.["data-test-id"] === "analysis-history-add-menu" ||
            (typeof props?.onItemClick === "function" && ("excludeOperators" in props || Array.isArray(props.items))))) {
          if (item.disabled || item.children?.length || groupKeys.has(item.key)) return null;
          const label = labelText(item.label).trim();
          return label && label.length <= 120 ? { key: item.key, label, cachedIcon: iconData(element.querySelector("svg")) } : null;
        }
        node = node.return;
      }
    }
    return null;
  }

  document.addEventListener("click", event => {
    if (!enabled || !inProject() || !(event.target instanceof Element)) return;
    const element = event.target.closest('[data-test-type="analysis-history-add-option"]');
    if (element) {
      const key = Number(element.getAttribute("data-test-name"));
      if (!Number.isInteger(key) || groupKeys.has(key) || element.closest('[aria-disabled="true"], [disabled], .disabled')) return;
      const label = element.textContent.trim().replace(/\s+/g, " ");
      if (label && label.length <= 120) remember({ key, label, cachedIcon: iconData(element.querySelector("svg")) });
      return;
    }
    // 部署版本可能没有 data-test 属性，直接识别原生 MenuItem 的操作数据。
    const menuAction = clickedMenuAction(event.target);
    if (menuAction) { remember(menuAction); return; }
    // 原顶部直达按钮同样记入最近操作，不把分类下拉、右侧管理按钮计入。
    for (const container of document.querySelectorAll(".hd-analysis-quick-operator")) {
      if (!container.contains(event.target) || event.target.closest("[data-jsy-recent-bar]")) continue;
      const button = event.target.closest("button");
      if (!button || button.disabled) continue;
      const fiber = toolsFiber(container);
      if (!fiber || fiber.memoizedProps.disabled) continue;
      const label = button.textContent.trim();
      const action = Array.from(catalog(fiber, container).values()).find(item => item.label === label && !item.disabled);
      if (action) remember({ ...action, cachedIcon: iconData(button.querySelector("svg")) });
    }
  }, true);

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "jsy-tools" || event.data.type !== "settings") return;
    enabled = event.data.recentActionsEnabled === true;
    const seen = new Set();
    recent = (Array.isArray(event.data.recentActions) ? event.data.recentActions : []).filter(item => {
      if (!Number.isInteger(item?.key) || groupKeys.has(item.key) || seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
    schedule();
  });
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element) || !record.target.closest("[data-jsy-recent-bar]"))) schedule();
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "class"] });
  window.addEventListener("popstate", schedule);
  window.navigation?.addEventListener("navigatesuccess", schedule);
  // React 可在 DOM 未改变时更新回调；定时读取当前实例，不缓存旧项目的闭包。
  setInterval(() => { if (enabled || bars.size) schedule(); }, 1000);
  window.postMessage({ channel: "jsy-tools", type: "ready" }, location.origin);
})();
