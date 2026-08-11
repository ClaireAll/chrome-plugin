(() => {
  const ROOT_ID = "__style_inspector_root__";
  const TOGGLE_MESSAGE = "STYLE_TOGGLE_INSPECTOR";
  const UPDATE_MESSAGE = "STYLE_SETTINGS_UPDATED";
  const GET_SETTINGS_MESSAGE = "STYLE_GET_SETTINGS";

  const FALLBACK_SETTINGS = {
    selectionScope: "descendants",
    selectionMode: "click",
    showPadding: true,
    showMargin: true,
    showBorder: true,
    showGap: true,
    showSize: true,
    showFont: true,
    showColor: false,
    opacity: 0.06,
    labelSize: 11,
    highlightColor: "#22c55e",
    layerColors: {
      padding: "#f59e0b",
      margin: "#38bdf8",
      border: "#ef4444",
      gap: "#a78bfa",
      size: "#22c55e",
      font: "#14b8a6",
      color: "#fb7185"
    },
    maxAnnotations: 260,
    theme: "dark"
  };

  const TYPE_COLORS = {
    padding: "#f59e0b",
    margin: "#38bdf8",
    gap: "#a78bfa",
    size: "#22c55e",
    font: "#14b8a6",
    color: "#fb7185"
  };

  let enabled = false;
  let root = null;
  let settings = { ...FALLBACK_SETTINGS };
  let inspectorPromise = null;
  let cleanupCallbacks = [];
  let frameHandle = 0;
  let selectedElement = null;
  let analysisElement = null;
  let boxDrag = null;
  let analysisPanelDismissed = false;
  let hoveredOverlayKey = null;
  let nextOverlayKey = 1;
  const overlayKeys = new WeakMap();

  function getInspectorModule() {
    if (!inspectorPromise) {
      inspectorPromise = import(chrome.runtime.getURL("src/shared/inspector.js"));
    }
    return inspectorPromise;
  }

  function requestSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: GET_SETTINGS_MESSAGE }, (response) => {
        if (chrome.runtime.lastError || !response?.settings) {
          resolve({ ...FALLBACK_SETTINGS });
          return;
        }
        resolve(response.settings);
      });
    });
  }

  function hexToRgb(hex) {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : FALLBACK_SETTINGS.highlightColor;
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16)
    };
  }

  function alphaColor(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function layerColor(type) {
    return settings.layerColors?.[type] || TYPE_COLORS[type] || settings.highlightColor;
  }

  function numberValue(value) {
    const number = Number.parseFloat(String(value || "0"));
    return Number.isFinite(number) ? number : 0;
  }

  function addListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    cleanupCallbacks.push(() => target.removeEventListener(type, listener, options));
  }

  function ensureRoot() {
    let existing = document.getElementById(ROOT_ID);
    if (!existing) {
      existing = document.createElement("div");
      existing.id = ROOT_ID;
      document.documentElement.append(existing);
    }
    root = existing;
    root.dataset.mode = "select";
    root.dataset.selectionMode = settings.selectionMode || "click";
    root.style.setProperty("--si-label-size", `${settings.labelSize}px`);
    root.style.setProperty("--si-theme-accent", settings.highlightColor);
    root.style.setProperty("--si-theme-fill", alphaColor(settings.highlightColor, settings.opacity));
    for (const type of ["padding", "margin", "border", "gap", "size", "font", "color"]) {
      const color = layerColor(type);
      root.style.setProperty(`--si-${type}`, color);
      root.style.setProperty(`--si-${type}-fill`, alphaColor(color, settings.opacity));
    }
  }

  function removeRoot() {
    root?.remove();
    root = null;
  }

  function splitMetricParts(value) {
    return String(value || "")
      .split(" | ")
      .flatMap((part) => part.split("\n"))
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function finalTextFromSource(text) {
    const match = String(text || "").match(/(?:\uFF08([^\uFF08\uFF09()]+)\uFF09|\(([^()]+)\))\s*$/);
    if (!match) {
      return "";
    }
    return (match[1] || match[2] || "").split(/\s*,\s*/)[0].trim();
  }

  function directClassTokenPart(value, element) {
    const firstPart = splitMetricParts(value)[0] || String(value || "");
    const tokens = elementClassTokens(element).sort((a, b) => b.length - a.length);
    for (const token of tokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`^${escaped}(?=$|\\s|\uFF08|\\()`).test(firstPart)) {
        return {
          token,
          value: finalTextFromSource(firstPart)
        };
      }
    }
    return null;
  }

  function metricPrimaryFromClass(value, element) {
    return Boolean(directClassTokenPart(value, element));
  }

  function metricPrimaryText(value, element = null) {
    const firstPart = splitMetricParts(value)[0] || String(value || "");
    const directClass = directClassTokenPart(value, element);
    if (directClass) {
      return `\uD83C\uDF88 ${[directClass.token, directClass.value].filter(Boolean).join(" ")}`;
    }

    const primary = finalTextFromSource(firstPart) || firstPart;
    return primary;
  }

  function rowSummary(rows, element = null) {
    return rows
      .map((row) => `${row.label}: ${metricPrimaryText(row.value, element)}`)
      .join("\n");
  }

  function elementClassTokens(element) {
    const className = element?.className;
    if (!className) {
      return [];
    }
    if (typeof className === "string") {
      return className.split(/\s+/).filter(Boolean);
    }
    if (typeof className.baseVal === "string") {
      return className.baseVal.split(/\s+/).filter(Boolean);
    }
    return Array.from(element?.classList || []).filter(Boolean);
  }

  function valuePartFromClass(element, part) {
    return Boolean(directClassTokenPart(part, element));
  }

  function detailValueParts(parts, element) {
    const firstPart = parts[0] || "";
    if (directClassTokenPart(firstPart, element)) {
      return parts.slice(1);
    }
    return finalTextFromSource(firstPart) || valuePartFromClass(element, firstPart) ? parts : parts.slice(1);
  }

  function formattedDetailParts(parts) {
    const details = [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const propertyMatch = part.match(/^([\w-]+):\s*(.*)$/);
      const nextPart = parts[index + 1] || "";
      if (propertyMatch && /^(var\(--[\w-]+\)|--[\w-]+)/.test(nextPart)) {
        details.push(`${propertyMatch[1]}: ${nextPart}`);
        index += 1;
        continue;
      }
      details.push(part);
    }
    return details;
  }

  function metricValueLines(value, element) {
    const parts = splitMetricParts(value);
    const primary = metricPrimaryText(value, element);
    const detailParts = formattedDetailParts(detailValueParts(parts, element));

    const details = detailParts.map((part) => {
      const fromClass = valuePartFromClass(element, part);
      return {
        text: `${fromClass ? "\uD83C\uDF88 " : ""}${part}`
      };
    });

    return { primary, details };
  }

  function toggleMetricDetails(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const value = button.closest(".style-inspector-model-value");
    const details = value?.querySelector(".style-inspector-model-value-details");
    if (!details) {
      return;
    }

    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", expanded ? "false" : "true");
    button.setAttribute("aria-label", expanded ? "expand source details" : "collapse source details");
    button.textContent = expanded ? "+" : "\u2212";
    value.classList.toggle("is-expanded", !expanded);
    details.hidden = expanded;
  }

  function renderMetricValue(value, element, options = {}) {
    const { primary, details } = metricValueLines(value, element);
    const container = document.createElement("strong");
    container.className = "style-inspector-model-value";
    if (details.length) {
      container.classList.add("has-details");
    }
    if (options.expanded) {
      container.classList.add("is-expanded");
    }

    const summary = document.createElement("span");
    summary.className = "style-inspector-model-value-summary";

    const primaryLine = document.createElement("span");
    primaryLine.className = "style-inspector-model-value-line";
    primaryLine.textContent = primary;
    summary.append(primaryLine);

    if (details.length && options.showToggle !== false) {
      const toggle = document.createElement("button");
      toggle.className = "style-inspector-model-value-toggle";
      toggle.type = "button";
      toggle.textContent = "+";
      toggle.setAttribute("aria-label", "toggle source details");
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", toggleMetricDetails);
      summary.append(toggle);
    }

    container.append(summary);

    if (details.length) {
      const detailsContainer = document.createElement("span");
      detailsContainer.className = "style-inspector-model-value-details";
      detailsContainer.hidden = !options.expanded;

      for (const line of details) {
        const item = document.createElement("span");
        item.className = "style-inspector-model-value-line is-child";
        item.textContent = line.text;
        detailsContainer.append(item);
      }

      container.append(detailsContainer);
    }

    return container;
  }

  function createBox(item, variant = "global") {
    const primaryType = settings.showColor ? "color" : item.rows[0]?.type || "size";
    const accent = layerColor(primaryType);
    const overlayKey = getOverlayKey(item.element);
    const box = document.createElement("div");
    box.className = `style-inspector-box is-${primaryType} is-${variant}`;
    box.dataset.styleInspectorKey = overlayKey;
    box.dataset.styleInspectorTargetKey = overlayKey;
    box.dataset.styleInspectorTargetType = "box";
    box.style.left = `${Math.max(item.rect.left, 0)}px`;
    box.style.top = `${Math.max(item.rect.top, 0)}px`;
    box.style.width = `${Math.max(item.rect.width, 0)}px`;
    box.style.height = `${Math.max(item.rect.height, 0)}px`;
    box.style.setProperty("--si-accent", accent);
    box.style.setProperty("--si-fill", alphaColor(accent, settings.opacity));
    return box;
  }

  function applyLabelPlacement(label, placement) {
    label.classList.remove("is-top", "is-right", "is-bottom", "is-left");
    label.classList.add(`is-${placement.position}`);
    const minWidth = label.classList.contains("style-inspector-color-card")
      ? 220
      : label.classList.contains("has-details")
        ? 172
        : 0;
    const width = Math.min(window.innerWidth - 12, Math.max(Math.round(placement.width), minWidth));
    const left = Math.min(Math.max(6, Math.round(placement.left)), Math.max(6, window.innerWidth - width - 6));
    label.style.left = `${left}px`;
    label.style.top = `${Math.round(placement.top)}px`;
    label.style.width = label.classList.contains("style-inspector-color-card") ? `${width}px` : "";
    label.style.maxWidth = `${width}px`;
  }

  function labelAvoidRects(boundary) {
    if (!boundary) {
      return [];
    }

    const rects = [];
    const gutterLimit = 260;
    const leftWidth = Math.max(boundary.left, 0);
    const rightLeft = boundary.left + boundary.width;
    const rightWidth = Math.max(window.innerWidth - rightLeft, 0);

    if (leftWidth > 0 && leftWidth < gutterLimit) {
      rects.push({ left: 0, top: 0, width: leftWidth, height: window.innerHeight });
    }

    if (rightWidth > 0 && rightWidth < gutterLimit) {
      rects.push({ left: rightLeft, top: 0, width: rightWidth, height: window.innerHeight });
    }

    return rects;
  }

  function connectorPoints(rect, placement) {
    const labelCenterY = placement.top + placement.height / 2;
    const labelCenterX = placement.left + placement.width / 2;
    const elementCenterY = rect.top + rect.height / 2;
    const elementCenterX = rect.left + rect.width / 2;

    if (placement.position === "right") {
      return {
        start: { x: rect.left + rect.width, y: elementCenterY },
        end: { x: placement.left, y: labelCenterY }
      };
    }

    if (placement.position === "left") {
      return {
        start: { x: rect.left, y: elementCenterY },
        end: { x: placement.left + placement.width, y: labelCenterY }
      };
    }

    if (placement.position === "bottom") {
      return {
        start: { x: elementCenterX, y: rect.top + rect.height },
        end: { x: labelCenterX, y: placement.top }
      };
    }

    return {
      start: { x: elementCenterX, y: rect.top },
      end: { x: labelCenterX, y: placement.top + placement.height }
    };
  }

  function createConnector(item, placement) {
    const { start, end } = connectorPoints(item.rect, placement);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const line = document.createElement("span");
    line.className = "style-inspector-connector";
    line.style.left = `${Math.round(start.x)}px`;
    line.style.top = `${Math.round(start.y)}px`;
    line.style.width = `${Math.max(Math.round(Math.hypot(dx, dy)), 2)}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    return line;
  }

  function clearLabelTarget() {
    root?.querySelectorAll(".is-target-hover").forEach((node) => {
      node.classList.remove("is-target-hover");
    });
  }

  function activateLabelTarget(box, targetType) {
    clearLabelTarget();
    box.classList.add("is-label-hover", "is-front");

    if (!targetType || targetType === "size" || targetType === "font" || targetType === "color") {
      box.classList.add("is-target-hover");
      return;
    }

    const key = box.dataset.styleInspectorKey;
    root
      ?.querySelectorAll(
        `[data-style-inspector-target-key="${key}"][data-style-inspector-target-type="${targetType}"]`
      )
      .forEach((node) => node.classList.add("is-target-hover"));
  }

  function selectElementFromLabel(event, element) {
    event.preventDefault();
    event.stopPropagation();
    if (!enabled || !element?.isConnected) {
      return;
    }

    analysisElement = element;
    boxDrag = null;
    analysisPanelDismissed = false;
    const renderElement = selectedElement?.isConnected ? selectedElement : element;
    selectedElement = renderElement;
    getInspectorModule().then((inspector) => renderSelectedElement(inspector, renderElement));
  }

  function bindLabelHover(box, label, item) {
    const rows = Array.from(label.querySelectorAll("[data-style-inspector-target-type]"));

    for (const row of rows) {
      row.addEventListener("mouseenter", () => {
        activateLabelTarget(box, row.dataset.styleInspectorTargetType);
        row.classList.add("is-target-hover");
      });
      row.addEventListener("mouseleave", () => {
        row.classList.remove("is-target-hover");
        clearLabelTarget();
      });
    }

    label.addEventListener("mouseenter", () => {
      box.classList.add("is-label-hover", "is-front");
    });
    label.addEventListener("mouseleave", () => {
      box.classList.remove("is-label-hover", "is-front", "is-target-hover");
      rows.forEach((row) => row.classList.remove("is-target-hover"));
      clearLabelTarget();
    });
    label.addEventListener("click", (event) => selectElementFromLabel(event, item.element));
  }

  function getOverlayKey(element) {
    if (!overlayKeys.has(element)) {
      overlayKeys.set(element, String(nextOverlayKey));
      nextOverlayKey += 1;
    }
    return overlayKeys.get(element);
  }

  function findOverlayKeyFromTarget(target) {
    let current = target;
    while (current && current !== document.documentElement) {
      if (current.dataset?.styleInspectorKey) {
        return current.dataset.styleInspectorKey;
      }
      if (current.dataset?.styleInspectorTargetKey) {
        return current.dataset.styleInspectorTargetKey;
      }
      if (overlayKeys.has(current)) {
        return overlayKeys.get(current);
      }
      current = current.parentElement;
    }
    return null;
  }

  function bringOverlayLabelToFront(target) {
    if (!root || !target) {
      return;
    }

    const key = findOverlayKeyFromTarget(target);
    if (key === hoveredOverlayKey) {
      return;
    }

    if (hoveredOverlayKey) {
      root
        .querySelector(`[data-style-inspector-key="${hoveredOverlayKey}"]`)
        ?.classList.remove("is-front");
    }

    hoveredOverlayKey = key;
    if (hoveredOverlayKey) {
      root
        .querySelector(`[data-style-inspector-key="${hoveredOverlayKey}"]`)
        ?.classList.add("is-front");
    }
  }

  function setRect(node, rect) {
    node.style.left = `${Math.max(rect.left, 0)}px`;
    node.style.top = `${Math.max(rect.top, 0)}px`;
    node.style.width = `${Math.max(rect.width, 0)}px`;
    node.style.height = `${Math.max(rect.height, 0)}px`;
  }

  function documentPointFromEvent(event) {
    return {
      x: event.clientX + window.scrollX,
      y: event.clientY + window.scrollY
    };
  }

  function documentBoxFromPoints(start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function viewportRectFromDocumentBox(box) {
    return {
      left: box.left - window.scrollX,
      top: box.top - window.scrollY,
      width: box.width,
      height: box.height
    };
  }

  function rectsIntersect(a, b) {
    return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
  }

  function rectRight(rect) {
    return rect.left + rect.width;
  }

  function rectBottom(rect) {
    return rect.top + rect.height;
  }

  function rectCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function pointInsideRect(point, rect) {
    return point.x >= rect.left && point.x <= rectRight(rect) && point.y >= rect.top && point.y <= rectBottom(rect);
  }

  function intersectionArea(a, b) {
    const width = Math.max(0, Math.min(rectRight(a), rectRight(b)) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.top, b.top));
    return width * height;
  }

  function selectionCandidateScore(rect, selectionRect) {
    const center = rectCenter(rect);
    const selectionCenter = rectCenter(selectionRect);
    const edgeDistance =
      Math.abs(rect.left - selectionRect.left) +
      Math.abs(rect.top - selectionRect.top) +
      Math.abs(rectRight(rect) - rectRight(selectionRect)) +
      Math.abs(rectBottom(rect) - rectBottom(selectionRect));
    const centerDistance = Math.hypot(center.x - selectionCenter.x, center.y - selectionCenter.y);
    const areaDifference = Math.abs(rect.width * rect.height - selectionRect.width * selectionRect.height);
    const overlapRatio = intersectionArea(rect, selectionRect) / Math.max(1, Math.min(rect.width * rect.height, selectionRect.width * selectionRect.height));
    return edgeDistance + centerDistance * 0.35 + areaDifference * 0.002 - overlapRatio * 120;
  }

  function createLayer(className, rect, type, text, overlayKey) {
    const node = document.createElement("div");
    node.className = `style-inspector-layer ${className}`;
    setRect(node, rect);
    node.style.setProperty("--si-layer-accent", layerColor(type));
    node.style.setProperty("--si-layer-fill", alphaColor(layerColor(type), settings.opacity));
    if (overlayKey) {
      node.dataset.styleInspectorTargetKey = overlayKey;
      node.dataset.styleInspectorTargetType = type;
    }
    if (text) {
      const label = document.createElement("span");
      label.className = "style-inspector-layer-label";
      label.textContent = text;
      node.append(label);
    }
    return node;
  }

  function appendBoxSideLayers(fragment, inspector, rect, sides, type, mode, overlayKey) {
    if (!sides) {
      return;
    }

    for (const layerRect of inspector.boxSideRects(rect, sides, mode)) {
      fragment.append(
        createLayer(
          `style-inspector-layer-${type} is-${layerRect.side}`,
          layerRect,
          type,
          null,
          overlayKey
        )
      );
    }
  }

  function gapChildRects(element) {
    return Array.from(element?.children || [])
      .filter((child) => child.id !== ROOT_ID && !root?.contains(child))
      .map((child) => {
        const rect = child.getBoundingClientRect();
        const style = getComputedStyle(child);
        if (!inspectorIsVisibleChild(rect, style)) {
          return null;
        }
        return rect;
      })
      .filter(Boolean);
  }

  function inspectorIsVisibleChild(rect, style) {
    return (
      rect.width >= 2 &&
      rect.height >= 2 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      numberValue(style.opacity || 1) !== 0
    );
  }

  function appendGapMarkers(fragment, inspector, item, overlayKey) {
    for (const marker of inspector.gapMarkerRects(gapChildRects(item.element))) {
      const node = document.createElement("span");
      node.className = `style-inspector-gap-slot is-${marker.orientation}`;
      node.dataset.styleInspectorTargetKey = overlayKey;
      node.dataset.styleInspectorTargetType = "gap";
      setRect(node, marker);
      node.style.setProperty("--si-layer-accent", layerColor("gap"));
      fragment.append(node);
    }
  }

  function boxNumbers(style) {
    return {
      margin: {
        top: numberValue(style.marginTop),
        right: numberValue(style.marginRight),
        bottom: numberValue(style.marginBottom),
        left: numberValue(style.marginLeft)
      },
      border: {
        top: numberValue(style.borderTopWidth),
        right: numberValue(style.borderRightWidth),
        bottom: numberValue(style.borderBottomWidth),
        left: numberValue(style.borderLeftWidth)
      },
      padding: {
        top: numberValue(style.paddingTop),
        right: numberValue(style.paddingRight),
        bottom: numberValue(style.paddingBottom),
        left: numberValue(style.paddingLeft)
      }
    };
  }

  function insetRect(rect, sides) {
    return {
      left: rect.left + sides.left,
      top: rect.top + sides.top,
      width: rect.width - sides.left - sides.right,
      height: rect.height - sides.top - sides.bottom
    };
  }

  function dismissAnalysisPanel(event) {
    event.preventDefault();
    event.stopPropagation();
    analysisPanelDismissed = true;
    root?.querySelectorAll(".style-inspector-analysis-panel").forEach((panel) => panel.remove());
  }

  function appendSideSection(panel, title, type, sides, element) {
    if (!sides) {
      return;
    }

    const section = document.createElement("section");
    section.className = `style-inspector-model-section is-${type}`;
    section.style.setProperty("--si-section-color", layerColor(type));

    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);

    const grid = document.createElement("div");
    grid.className = "style-inspector-model-grid";
    for (const key of ["top", "right", "bottom", "left"]) {
      const cell = document.createElement("div");
      cell.className = `style-inspector-model-cell is-${key}`;
      const name = document.createElement("span");
      name.textContent = key;
      const value = renderMetricValue(sides[key], element, { expanded: true, showToggle: false });
      cell.append(name, value);
      grid.append(cell);
    }

    section.append(grid);
    panel.append(section);
  }

  function renderAnalysisPanel(item, model) {
    const panel = document.createElement("aside");
    panel.className = "style-inspector-analysis-panel";

    const header = document.createElement("div");
    header.className = "style-inspector-analysis-header";

    const title = document.createElement("div");
    title.className = "style-inspector-analysis-title";
    title.textContent = `${item.element.tagName.toLowerCase()} selected`;

    const close = document.createElement("button");
    close.className = "style-inspector-analysis-close";
    close.type = "button";
    close.setAttribute("aria-label", "close analysis panel");
    close.textContent = "\u274C";
    close.addEventListener("click", dismissAnalysisPanel);

    header.append(title, close);
    panel.append(header);

    if (model.size) {
      const size = document.createElement("div");
      size.className = "style-inspector-size-line";
      size.append(renderMetricValue(model.size.value, item.element, { expanded: true, showToggle: false }));
      panel.append(size);
    }

    appendSideSection(panel, "Margin", "margin", model.margin, item.element);
    appendSideSection(panel, "Border", "border", model.border, item.element);
    appendSideSection(panel, "Padding", "padding", model.padding, item.element);

    if (model.gap) {
      const gap = document.createElement("section");
      gap.className = "style-inspector-model-section is-gap";
      gap.style.setProperty("--si-section-color", layerColor("gap"));
      const heading = document.createElement("h3");
      heading.textContent = "Gap";
      gap.append(heading);

      const values = document.createElement("div");
      values.className = "style-inspector-gap-values";
      for (const [label, value] of [
        ["row", model.gap.row],
        ["column", model.gap.column]
      ]) {
        const name = document.createElement("span");
        name.textContent = label;
        values.append(name, renderMetricValue(value, item.element, { expanded: true, showToggle: false }));
      }
      gap.append(values);
      panel.append(gap);
    }

    return panel;
  }

  function rowTypesForBoxModel(model) {
    return ["margin", "border", "padding", "gap", "size"].filter((type) => model?.[type]);
  }

  function renderBoxModelLayers(inspector, item, model, overlayKey) {
    const fragment = document.createDocumentFragment();
    const numbers = boxNumbers(item.style);
    const borderBox = item.rect;
    const visibleTypes = new Set(rowTypesForBoxModel(model));

    if (visibleTypes.has("margin")) {
      appendBoxSideLayers(fragment, inspector, borderBox, numbers.margin, "margin", "outside", overlayKey);
    }

    if (visibleTypes.has("border")) {
      appendBoxSideLayers(fragment, inspector, borderBox, numbers.border, "border", "inside", overlayKey);
    }

    const paddingBox = insetRect(borderBox, numbers.border);
    if (visibleTypes.has("padding")) {
      appendBoxSideLayers(fragment, inspector, paddingBox, numbers.padding, "padding", "inside", overlayKey);
    }

    if (visibleTypes.has("size")) {
      fragment.append(
        createLayer(
          "style-inspector-layer-content",
          insetRect(insetRect(borderBox, numbers.border), numbers.padding),
          "size",
          null,
          overlayKey
        )
      );
    }

    if (visibleTypes.has("gap")) {
      appendGapMarkers(fragment, inspector, item, overlayKey);
    }

    return fragment;
  }

  function renderSelectedAnalysisPanel(item) {
    if (!item || analysisPanelDismissed || settings.showColor) {
      return document.createDocumentFragment();
    }
    return renderAnalysisPanel(item, item.model);
  }

  function buildItem(inspector, element, options = {}) {
    if (!element || root?.contains(element)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!inspector.shouldInspectElement({ tagName: element.tagName, rect, style })) {
      return null;
    }

    const itemSettings = {
      ...settings,
      includeSourceDetails: options.includeSourceDetails === true
    };
    const rows = inspector.createMetricRows(element, style, itemSettings);
    const model = inspector.createBoxModel(element, style, itemSettings);
    return { element, rect, rows, style, model };
  }

  function roundedMetric(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function ensureSelectedRows(item) {
    if (!item || item.rows.length) {
      return item;
    }

    const fallbackRow =
      item.model?.size || {
        type: "size",
        label: "size",
        value: `${roundedMetric(item.rect.width)}x${roundedMetric(item.rect.height)}`
      };

    return { ...item, rows: [fallbackRow] };
  }

  function hasOwnTextContent(element) {
    return Array.from(element?.childNodes || []).some(
      (node) => node.nodeType === 3 && String(node.textContent || "").trim()
    );
  }

  function keepFirstTextFontRow(items) {
    let hasFontOwner = false;

    return items
      .map((item) => {
        const hasFontRow = item.rows?.some((row) => row.type === "font");
        if (!hasFontRow) {
          return item;
        }

        if (!hasFontOwner && hasOwnTextContent(item.element)) {
          hasFontOwner = true;
          return item;
        }

        return {
          ...item,
          rows: item.rows.filter((row) => row.type !== "font")
        };
      })
      .filter((item) => item.rows.length);
  }

  function keepFocusedColorItems(items) {
    const textItems = [];
    const textElements = new Set();

    for (const item of items) {
      const textRows = item.rows.filter((row) => row.label === "text");
      if (!textRows.length || !hasOwnTextContent(item.element)) {
        continue;
      }

      textElements.add(item.element);
      textItems.push({
        ...item,
        rows: textRows
      });
    }

    const innermostItems = items.filter((item) => {
      if (textElements.has(item.element)) {
        return false;
      }

      return !items.some(
        (candidate) =>
          candidate.element !== item.element &&
          item.element.contains(candidate.element)
      );
    });

    return [...textItems, ...innermostItems];
  }

  function getSelectedElements(inspector, element) {
    if (settings.selectionScope === "self") {
      const item = buildItem(inspector, element, { includeSourceDetails: true });
      const selectedWithRows = ensureSelectedRows(item);
      if (!selectedWithRows) {
        return [];
      }
      return settings.showColor
        ? keepFocusedColorItems([selectedWithRows])
        : keepFirstTextFontRow([selectedWithRows]);
    }

    const results = [];
    const selectedItem = buildItem(inspector, element, { includeSourceDetails: settings.showColor });
    const selectedWithRows = ensureSelectedRows(selectedItem);
    if (selectedWithRows?.rows.length) {
      results.push(selectedWithRows);
    }

    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
    for (let child = walker.nextNode(); child; child = walker.nextNode()) {
      if (root?.contains(child)) {
        continue;
      }

      const item = buildItem(inspector, child);
      if (!item || !item.rows.length) {
        continue;
      }

      results.push(item);
      if (results.length >= settings.maxAnnotations) {
        break;
      }
    }

    const scopedResults = settings.showColor ? keepFocusedColorItems(results) : results;
    const fontFilteredResults = keepFirstTextFontRow(scopedResults);
    const deduped = inspector.filterInformativeItems(
      inspector.dedupeRepeatedElements(fontFilteredResults),
      settings
    );
    const selectedAfterFontFilter = selectedWithRows
      ? fontFilteredResults.find((item) => item.element === selectedWithRows.element)
      : null;
    if (
      selectedAfterFontFilter?.rows.length &&
      !deduped.some((item) => item.element === selectedAfterFontFilter.element)
    ) {
      return [selectedAfterFontFilter, ...deduped];
    }

    if (deduped.length) {
      return deduped;
    }

    return selectedAfterFontFilter ? [selectedAfterFontFilter] : [];
  }

  function renderSelectionBoundary(element) {
    const rect = element.getBoundingClientRect();
    const boundary = document.createElement("div");
    boundary.className = "style-inspector-selection-boundary";
    setRect(boundary, rect);
    return boundary;
  }

  function renderBoxSelectionBoundary(box, variant = "") {
    const boundary = document.createElement("div");
    boundary.className = `style-inspector-selection-boundary is-box${variant ? ` ${variant}` : ""}`;
    setRect(boundary, viewportRectFromDocumentBox(box));
    return boundary;
  }

  function renderSelectedSelf(inspector, item) {
    if (settings.showColor) {
      return renderOverlayItems(inspector, [item], "selected-child", {
        avoidRect: item.rect
      });
    }

    const fragment = document.createDocumentFragment();
    fragment.append(renderBoxModelLayers(inspector, item, item.model, getOverlayKey(item.element)));
    fragment.append(renderSelectedAnalysisPanel(item));
    if (item.rows.length) {
      fragment.append(renderOverlayItems(inspector, [item], "selected-child"));
    }
    return fragment;
  }

  function renderSelectedDescendants(inspector, element) {
    const items = getSelectedElements(inspector, element);
    if (!items.length) {
      root?.replaceChildren();
      return;
    }

    if (settings.selectionScope === "self") {
      root.replaceChildren(renderSelectedSelf(inspector, items[0]));
      return;
    }

    const fragment = document.createDocumentFragment();
    fragment.append(renderSelectionBoundary(element));
    const analysisTarget =
      analysisElement?.isConnected && (analysisElement === element || element.contains(analysisElement))
        ? analysisElement
        : element;
    if (analysisTarget === element) {
      analysisElement = null;
    }
    const selectedAnalysisItem = settings.showColor
      ? null
      : ensureSelectedRows(buildItem(inspector, analysisTarget, { includeSourceDetails: true }));
    for (const item of items) {
      fragment.append(renderBoxModelLayers(inspector, item, item.model, getOverlayKey(item.element)));
    }
    fragment.append(renderSelectedAnalysisPanel(selectedAnalysisItem));
    fragment.append(
      renderOverlayItems(inspector, items, "selected-child", {
        avoidRect: element.getBoundingClientRect()
      })
    );
    root.replaceChildren(fragment);
  }

  function divFromSelectionBox(box) {
    const selectionRect = viewportRectFromDocumentBox(box);
    const selectionCenter = rectCenter(selectionRect);
    const candidates = [];
    const fallbackCandidates = [];

    for (const element of Array.from(document.getElementsByTagName("div"))) {
      if (root?.contains(element)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (!rectsIntersect(rect, selectionRect)) {
        continue;
      }
      if (rect.width < 2 || rect.height < 2) {
        continue;
      }

      const candidate = {
        element,
        rect,
        score: selectionCandidateScore(rect, selectionRect)
      };
      if (pointInsideRect(rectCenter(rect), selectionRect) || pointInsideRect(selectionCenter, rect)) {
        candidates.push(candidate);
      } else {
        fallbackCandidates.push(candidate);
      }
    }

    const best = (candidates.length ? candidates : fallbackCandidates).sort((a, b) => a.score - b.score)[0];
    return best?.element || null;
  }

  function renderLabel(item) {
    const label = document.createElement("div");
    label.className = "style-inspector-label";

    if (settings.showColor) {
      label.classList.add("style-inspector-color-card");
      for (const row of item.rows) {
        const line = document.createElement("div");
        line.className = `style-inspector-color-row is-${row.label}`;
        line.dataset.styleInspectorTargetType = "color";

        const swatch = document.createElement("span");
        swatch.className = "style-inspector-color-swatch";
        swatch.style.background = row.color || row.raw || row.value;
        if (row.label === "shadow") {
          swatch.style.boxShadow = row.raw || row.value;
        }
        const name = document.createElement("span");
        name.className = "style-inspector-color-name";
        name.textContent = row.state ? `${row.state} ${row.label}` : row.label;

        const value = document.createElement("strong");
        value.className = "style-inspector-color-value";
        value.title = row.value;
        for (const part of String(row.value || "").split(" | ").filter(Boolean)) {
          const valuePart = document.createElement("span");
          valuePart.className = "style-inspector-color-value-part";
          valuePart.textContent = part.trim();
          value.append(valuePart);
        }

        line.append(swatch, name, value);
        label.append(line);
      }
      return label;
    }

    label.classList.add("style-inspector-value-list");
    if (item.rows.some((row) => metricValueLines(row.value, item.element).details.length)) {
      label.classList.add("has-details");
    }
    for (const row of item.rows) {
      const line = document.createElement("div");
      line.className = `style-inspector-value-row is-${row.type}`;
      line.dataset.styleInspectorTargetType = row.type;
      line.style.setProperty("--si-row-color", layerColor(row.type));

      const name = document.createElement("span");
      name.textContent = row.label;

      const value = renderMetricValue(row.value, item.element);

      line.append(name, value);
      label.append(line);
    }
    return label;
  }

  function labelTextForItem(item) {
    return rowSummary(item.rows, item.element) || item.element.tagName.toLowerCase();
  }

  function colorLabelPlacementSize(item) {
    const width = Math.min(300, Math.max(220, window.innerWidth - 12));
    const valueLineCount = (item.rows || []).reduce((count, row) => {
      const parts = String(row.value || "")
        .split(" | ")
        .filter(Boolean);
      return count + Math.max(1, parts.length);
    }, 0);
    const rowCount = Math.max(1, item.rows?.length || 0);
    const height = Math.round(valueLineCount * settings.labelSize * 1.28 + rowCount * 10 + 12);
    return {
      width,
      height: Math.max(34, height)
    };
  }

  function labelPlacementSizeForItem(item) {
    return settings.showColor ? colorLabelPlacementSize(item) : null;
  }

  function renderOverlayItems(inspector, items, variant = "global", options = {}) {
    const fragment = document.createDocumentFragment();
    const placements = inspector.planLabelPlacements(
      items.map((item) => ({
        rect: item.rect,
        label: labelTextForItem(item),
        size: labelPlacementSizeForItem(item)
      })),
      {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        labelSize: settings.labelSize,
        avoidRect: options.avoidRect,
        avoidRects: labelAvoidRects(options.avoidRect)
      }
    );

    items.forEach((item, index) => {
      const box = createBox(item, variant);
      const label = renderLabel(item);
      applyLabelPlacement(label, placements[index]);
      bindLabelHover(box, label, item);
      box.append(createConnector(item, placements[index]));
      box.append(label);
      fragment.append(box);
    });

    return fragment;
  }

  function shouldWaitForSelection() {
    return !selectedElement;
  }

  async function renderGlobal() {
    const inspector = await getInspectorModule();
    if (!enabled || !root) {
      return;
    }

    if (shouldWaitForSelection()) {
      root.replaceChildren();
      return;
    }

    renderSelectedElement(inspector, selectedElement);
  }

  function renderSelectedElement(inspector, element) {
    renderSelectedDescendants(inspector, element);
  }

  function elementFromPointWithoutOverlay(x, y) {
    if (!root) {
      return null;
    }

    const previousPointerEvents = root.style.pointerEvents;
    root.style.pointerEvents = "none";
    const target = document.elementFromPoint(x, y);
    root.style.pointerEvents = previousPointerEvents;
    return target && !root.contains(target) ? target : null;
  }

  function boxSelectionMode() {
    return settings.selectionMode === "box";
  }

  function overlayControlTarget(target) {
    return Boolean(
      root?.contains(target) &&
        target.closest?.(
          ".style-inspector-analysis-panel, .style-inspector-label, .style-inspector-model-value-toggle"
        )
    );
  }

  function renderBoxDrag() {
    if (!boxDrag || !root) {
      return;
    }
    const box = documentBoxFromPoints(boxDrag.start, boxDrag.current);
    root.replaceChildren(renderBoxSelectionBoundary(box, "is-draft"));
  }

  function startBoxSelection(event) {
    if (!enabled || !boxSelectionMode() || event.button !== 0 || overlayControlTarget(event.target)) {
      return;
    }

    const point = documentPointFromEvent(event);
    boxDrag = {
      start: point,
      current: point
    };
    selectedElement = null;
    analysisPanelDismissed = false;
    renderBoxDrag();
    event.preventDefault();
    event.stopPropagation();
  }

  function moveBoxSelection(event) {
    if (!boxDrag) {
      return;
    }

    boxDrag.current = documentPointFromEvent(event);
    renderBoxDrag();
    event.preventDefault();
    event.stopPropagation();
  }

  function finishBoxSelection(event) {
    if (!boxDrag) {
      return;
    }

    boxDrag.current = documentPointFromEvent(event);
    const box = documentBoxFromPoints(boxDrag.start, boxDrag.current);
    boxDrag = null;
    event.preventDefault();
    event.stopPropagation();

    if (box.width < 4 || box.height < 4) {
      root?.replaceChildren();
      return;
    }

    const target = divFromSelectionBox(box);
    if (!target) {
      root?.replaceChildren();
      return;
    }

    selectedElement = target;
    analysisElement = null;
    analysisPanelDismissed = false;
    getInspectorModule().then((inspector) => renderSelectedElement(inspector, selectedElement));
  }

  function scheduleRender() {
    if (frameHandle) {
      return;
    }
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0;
      void renderGlobal();
    });
  }

  function bindRuntimeEvents() {
    addListener(window, "resize", scheduleRender);
    addListener(document, "scroll", scheduleRender, true);
    addListener(
      document,
      "mousemove",
      (event) => {
        bringOverlayLabelToFront(event.target);
      },
      true
    );
    addListener(document, "pointerdown", startBoxSelection, true);
    addListener(document, "pointermove", moveBoxSelection, true);
    addListener(document, "pointerup", finishBoxSelection, true);
    addListener(document, "pointercancel", finishBoxSelection, true);
    addListener(
      document,
      "click",
      (event) => {
        if (!enabled) {
          return;
        }
        if (boxSelectionMode()) {
          if (!overlayControlTarget(event.target)) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        if (root?.contains(event.target)) {
          return;
        }
        const target = root?.contains(event.target)
          ? elementFromPointWithoutOverlay(event.clientX, event.clientY)
          : event.target;
        if (!target) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        selectedElement = target;
        analysisElement = null;
        analysisPanelDismissed = false;
        getInspectorModule().then((inspector) => renderSelectedElement(inspector, selectedElement));
      },
      true
    );
    addListener(
      document,
      "keydown",
      (event) => {
        if (event.key !== "Escape" || (!selectedElement && !boxDrag)) {
          return;
        }
        selectedElement = null;
        analysisElement = null;
        boxDrag = null;
        root?.replaceChildren();
      },
      true
    );
  }

  async function enableInspector() {
    settings = await requestSettings();
    enabled = true;
    ensureRoot();
    bindRuntimeEvents();
    await renderGlobal();
  }

  function disableInspector() {
    enabled = false;
    selectedElement = null;
    analysisElement = null;
    boxDrag = null;
    analysisPanelDismissed = false;
    cleanupCallbacks.forEach((cleanup) => cleanup());
    cleanupCallbacks = [];
    if (frameHandle) {
      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    }
    removeRoot();
  }

  async function toggleInspector() {
    if (enabled) {
      disableInspector();
      return { enabled: false };
    }
    await enableInspector();
    return { enabled: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === TOGGLE_MESSAGE) {
      toggleInspector()
        .then(sendResponse)
        .catch((error) => sendResponse({ enabled, error: error?.message || "toggle failed" }));
      return true;
    }

    if (message?.type === UPDATE_MESSAGE) {
      const previousSelectionMode = settings.selectionMode;
      settings = { ...settings, ...message.settings };
      if (previousSelectionMode !== settings.selectionMode) {
        selectedElement = null;
        analysisElement = null;
        boxDrag = null;
        analysisPanelDismissed = false;
      }
      if (enabled) {
        ensureRoot();
        void renderGlobal();
      }
      sendResponse?.({ ok: true });
      return false;
    }

    return false;
  });
})();
