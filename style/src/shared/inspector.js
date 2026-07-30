const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "META",
  "LINK",
  "TITLE",
  "TEMPLATE",
  "NOSCRIPT",
  "BR"
]);

const TRANSPARENT_COLORS = new Set([
  "transparent",
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)"
]);

const CSS_COLOR_PATTERN = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8}\b)/i;

function getRect(element) {
  if (element?.rect) {
    return element.rect;
  }
  if (typeof element?.getBoundingClientRect === "function") {
    return element.getBoundingClientRect();
  }
  return { width: 0, height: 0, left: 0, top: 0 };
}

function getStyle(element) {
  if (element?.style && typeof element.style.display === "string") {
    return element.style;
  }
  if (typeof globalThis.getComputedStyle === "function") {
    return globalThis.getComputedStyle(element);
  }
  return {};
}

function toNumber(value) {
  const number = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) ? number : 0;
}

function formatPx(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded : String(rounded).replace(/\.?0+$/, "")}px`;
}

function compactSides(top, right, bottom, left) {
  const values = [top, right, bottom, left].map((value) => String(value || "0px"));
  if (values.every((value) => value === values[0])) {
    return values[0];
  }
  if (values[0] === values[2] && values[1] === values[3]) {
    return `${values[0]} ${values[1]}`;
  }
  return values.join(" ");
}

function getClassTokens(element) {
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
  if (Array.isArray(className)) {
    return className.filter(Boolean);
  }
  return String(className).split(/\s+/).filter(Boolean);
}

function findToken(element, prefixes) {
  const tokens = getClassTokens(element);
  return tokens.find((token) => prefixes.some((prefix) => tokenMatchesPrefix(token, prefix)));
}

function findTokens(element, prefixes) {
  return getClassTokens(element).filter((token) =>
    prefixes.some((prefix) => tokenMatchesPrefix(token, prefix))
  );
}

function tokenMatchesPrefix(token, prefix) {
  return prefix.endsWith("-") ? token === prefix || token.startsWith(prefix) : token === prefix;
}

function tokenValue(element, prefixes, value, style) {
  const token = findToken(element, prefixes);
  return token ? `${token}\uFF08${computedTokenDisplayValue(element, token, value, style)}\uFF09` : value;
}

function tokenListValue(element, prefixes, value, style) {
  const tokens = findTokens(element, prefixes);
  if (!tokens.length) {
    return value;
  }
  return `${tokens.join(", ")}\uFF08${computedTokenDisplayValue(element, tokens[0], value, style)}\uFF09`;
}

function sideTokenValue(element, sidePrefixes, shorthandPrefixes, value, allValues, style, properties = [], options = {}) {
  const sideToken = findToken(element, sidePrefixes);
  if (sideToken) {
    return `${sideToken}\uFF08${computedTokenDisplayValue(element, sideToken, value, style)}\uFF09`;
  }

  const allSidesMatch = allValues?.every((item) => item === value);
  if (allSidesMatch) {
    const shorthandValue = tokenValue(element, shorthandPrefixes, value, style);
    if (shorthandValue !== value) {
      return shorthandValue;
    }
  }

  if (!options.includeSourceDetails) {
    return value;
  }

  return uniqueValues([value, ...lengthDeclarationSummaries(element, style, properties)]).join(" | ");
}

function rootFontSize(element) {
  const root = element?.ownerDocument?.documentElement || globalThis.document?.documentElement;
  if (root) {
    const fontSize = toNumber(getStyle(root).fontSize);
    if (fontSize) {
      return fontSize;
    }
  }
  return 16;
}

function elementFontSize(element, style) {
  return toNumber(style?.fontSize) || toNumber(getStyle(element).fontSize) || rootFontSize(element);
}

function arbitraryTokenRawValue(token) {
  return String(token || "").match(/\[([^\]]+)\]/)?.[1] || "";
}

function resolvedLengthTokenValue(rawValue, element, style) {
  const normalized = String(rawValue || "").trim().replace(/_/g, " ");
  if (!normalized) {
    return "";
  }

  const parts = normalized.split(/\s+/);
  const resolved = parts.map((part) => {
    const match = part.match(/^(-?\d*\.?\d+)(px|em|rem)$/i);
    if (!match) {
      return null;
    }

    const number = Number.parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "px") {
      return formatPx(number);
    }
    if (unit === "em") {
      return formatPx(number * elementFontSize(element, style));
    }
    return formatPx(number * rootFontSize(element));
  });

  return resolved.every(Boolean) ? resolved.join(" ") : "";
}

function computedTokenDisplayValue(element, token, value, style) {
  const rawValue = arbitraryTokenRawValue(token);
  const resolvedValue = resolvedLengthTokenValue(rawValue, element, style);
  if (!resolvedValue) {
    return value;
  }

  const units = Array.from(String(rawValue).matchAll(/-?\d*\.?\d+(px|em|rem)\b/gi)).map((match) =>
    match[1].toLowerCase()
  );
  const usesRem = units.includes("rem");
  const usesEm = units.includes("em");
  if (usesEm || usesRem) {
    const base = usesEm ? elementFontSize(element, style) : rootFontSize(element);
    const baseText = `font ${formatPx(base)}`;
    return resolvedValue === value ? `${value}, ${baseText}` : `${value}, ${resolvedValue}, ${baseText}`;
  }

  return resolvedValue;
}

function hasUsefulSpacing(...values) {
  return values.some((value) => toNumber(value) !== 0);
}

function metricEnabled(settings, key) {
  return settings?.[key] !== false;
}

function attributeValue(element, name) {
  try {
    return element?.getAttribute?.(name) || element?.[name] || "";
  } catch {
    return element?.[name] || "";
  }
}

function isIconLikeElement(element) {
  const tagName = String(element?.tagName || "").toUpperCase();
  if (["SVG", "IMG", "CANVAS", "I"].includes(tagName)) {
    return true;
  }

  if (String(attributeValue(element, "role")).toLowerCase() === "img") {
    return true;
  }

  return getClassTokens(element).some((token) => /icon|anticon|lucide|svg/i.test(token));
}

function isVisibleColor(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  return !TRANSPARENT_COLORS.has(value.trim().toLowerCase());
}

function hasVisibleBorder(style) {
  return isVisibleColor(style.borderTopColor) && toNumber(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
}

function extractShadowColor(value) {
  const shadow = String(value || "");
  return shadow.match(CSS_COLOR_PATTERN)?.[0] || shadow;
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function cssVariableNames(value) {
  return uniqueValues(Array.from(String(value || "").matchAll(/var\(\s*(--[\w-]+)/g)).map((match) => match[1]));
}

function customPropertyValue(element, name) {
  if (!name) {
    return "";
  }

  const candidates = [
    element,
    element?.ownerDocument?.documentElement,
    globalThis.document?.documentElement,
    element?.ownerDocument?.body,
    globalThis.document?.body
  ].filter(Boolean);

  for (const candidate of candidates) {
    const inlineValue = candidate.style?.getPropertyValue?.(name);
    if (inlineValue) {
      return inlineValue.trim();
    }
    const computedValue = getStyle(candidate)?.getPropertyValue?.(name);
    if (computedValue) {
      return computedValue.trim();
    }
  }

  return "";
}

function colorVariableCandidates(element) {
  const candidates = [];
  const visited = new Set();
  let current = element;
  while (current) {
    candidates.push(current);
    current = current.parentElement;
  }
  candidates.push(
    element?.ownerDocument?.documentElement,
    globalThis.document?.documentElement,
    element?.ownerDocument?.body,
    globalThis.document?.body
  );

  const variables = [];
  for (const candidate of candidates.filter(Boolean)) {
    if (visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    for (const style of [candidate.style, getStyle(candidate)].filter(Boolean)) {
      const names = new Set();
      for (let index = 0; index < Number(style.length || 0); index += 1) {
        const name = style.item?.(index) || style[index];
        if (String(name).startsWith("--")) {
          names.add(name);
        }
      }
      for (const name of Object.keys(style)) {
        if (name.startsWith("--")) {
          names.add(name);
        }
      }

      for (const name of names) {
        const value = style.getPropertyValue?.(name) || style[name];
        if (value) {
          variables.push({ name, value: String(value).trim() });
        }
      }
    }
  }

  return variables;
}

function cssVariableColorValue(element, name, visited = new Set()) {
  if (!name || visited.has(name)) {
    return "";
  }

  visited.add(name);
  const value = customPropertyValue(element, name);
  if (!value) {
    return "";
  }

  const directColor = extractShadowColor(value);
  if (rgbParts(directColor)) {
    return directColor;
  }

  for (const nestedName of cssVariableNames(value)) {
    const nestedColor = cssVariableColorValue(element, nestedName, visited);
    if (nestedColor) {
      return nestedColor;
    }
  }

  return "";
}

function matchingColorVariables(element, color) {
  const targetHex = hexString(color);
  if (!targetHex) {
    return [];
  }

  return uniqueValues(
    colorVariableCandidates(element)
      .filter((variable) => {
        const colorValue = cssVariableColorValue(element, variable.name) || extractShadowColor(variable.value);
        return hexString(extractShadowColor(colorValue)) === targetHex;
      })
      .map((variable) => variable.name)
  );
}

function stylePropertyValue(style, property) {
  const direct = style?.getPropertyValue?.(property);
  if (direct) {
    return direct.trim();
  }
  const camel = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return String(style?.[camel] || "").trim();
}

function normalizeSelector(selector) {
  return String(selector || "").replace(/\\/g, "");
}

function splitSelectorList(selector) {
  const parts = [];
  let current = "";
  let depth = 0;

  for (const char of String(selector || "")) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function selectorHasToken(selector, token) {
  const normalized = normalizeSelector(selector);
  return normalized.includes(`.${token}`) || normalized.includes(`.${token}:`);
}

function selectorState(selector) {
  const normalized = normalizeSelector(selector);
  return ["hover", "active", "focus-visible", "focus", "disabled"].find((state) =>
    normalized.includes(`:${state}`)
  ) || "";
}

function selectorWithoutState(selector, state) {
  return normalizeSelector(selector)
    .replace(new RegExp(`:${state}(?=[\\s.#:[>+~)]|$)`, "g"), "")
    .trim();
}

function selectorMatchesElement(element, selector, state = "") {
  const baseSelector = state ? selectorWithoutState(selector, state) : normalizeSelector(selector);
  if (baseSelector && typeof element?.matches === "function") {
    try {
      if (element.matches(baseSelector)) {
        return true;
      }
    } catch {
      // Escaped utility selectors are handled by class-token matching.
    }
  }

  return getClassTokens(element).some((token) => selectorHasToken(selector, token));
}

function selectorMatchesElementState(element, selector, state) {
  return selectorMatchesElement(element, selector, state);
}

function selectorClassTokens(element, selector) {
  return getClassTokens(element).filter((token) => selectorHasToken(selector, token));
}

function cssRulesFromDocument(documentRef) {
  const rules = [];

  function collect(ruleList) {
    for (const rule of Array.from(ruleList || [])) {
      if (rule.selectorText) {
        rules.push(rule);
      }
      if (rule.cssRules) {
        collect(rule.cssRules);
      }
    }
  }

  for (const sheet of Array.from(documentRef?.styleSheets || [])) {
    try {
      collect(sheet.cssRules);
    } catch {
      // Ignore cross-origin stylesheets.
    }
  }
  return rules;
}

function declarationMatchForToken(element, token, properties, expectedState = "") {
  if (!token) {
    return null;
  }

  for (const rule of cssRulesFromDocument(element?.ownerDocument || globalThis.document)) {
    for (const selector of splitSelectorList(rule.selectorText)) {
      if (!selectorHasToken(selector, token)) {
        continue;
      }

      const state = selectorState(selector);
      if (expectedState ? state !== expectedState : state) {
        continue;
      }

      for (const property of properties) {
        const value = stylePropertyValue(rule.style, property);
        if (value) {
          return { value, tokens: [token], selector };
        }
      }
    }
  }

  return null;
}

function declarationForToken(element, token, properties, expectedState = "") {
  return declarationMatchForToken(element, token, properties, expectedState)?.value || "";
}

function declarationMatchForElement(element, properties, expectedState = "") {
  for (const rule of cssRulesFromDocument(element?.ownerDocument || globalThis.document)) {
    for (const selector of splitSelectorList(rule.selectorText)) {
      const state = selectorState(selector);
      if (expectedState ? state !== expectedState : state) {
        continue;
      }
      if (!selectorMatchesElement(element, selector, state)) {
        continue;
      }

      for (const property of properties) {
        const value = stylePropertyValue(rule.style, property);
        if (value) {
          return { value, tokens: selectorClassTokens(element, selector), selector };
        }
      }
    }
  }

  return null;
}

function declarationForElement(element, properties, expectedState = "") {
  return declarationMatchForElement(element, properties, expectedState)?.value || "";
}

function rgbParts(value) {
  const text = String(value || "").trim();
  const legacy = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (legacy) {
    return legacy.slice(1, 4).map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))));
  }

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex?.length === 3) {
    return hex.split("").map((part) => Number.parseInt(`${part}${part}`, 16));
  }
  if (hex?.length === 6) {
    return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  }

  return null;
}

function rgbString(value) {
  const parts = rgbParts(value);
  return parts ? `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})` : String(value || "");
}

function hexString(value) {
  const parts = rgbParts(value);
  if (!parts) {
    return "";
  }
  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function resolvedCssColor(element, cssValue, fallbackColor) {
  const directVariables = cssVariableNames(cssValue);
  const variableValue = directVariables.map((name) => cssVariableColorValue(element, name)).find(Boolean) || "";
  const cssColor = extractShadowColor(variableValue || cssValue || "");
  const candidate = rgbParts(cssColor) ? cssColor : fallbackColor;
  const rgb = rgbString(candidate);
  const cssVariables = uniqueValues([...directVariables, ...matchingColorVariables(element, rgb)]);
  return {
    cssVariable: cssVariables.join(", "),
    cssVariables,
    rgb,
    hex: hexString(rgb),
    color: rgb || fallbackColor
  };
}

function colorPropertiesForLabel(label) {
  if (label === "text") {
    return ["color"];
  }
  if (label === "bg") {
    return ["background-color", "background"];
  }
  if (label === "border") {
    return ["border-color", "border-top-color", "border"];
  }
  return ["box-shadow"];
}

function colorMetricRow(element, label, prefixes, color, raw = color, options = {}) {
  const includeSourceDetails = options.includeSourceDetails === true;
  const token = options.token || findToken(element, prefixes);
  const properties = colorPropertiesForLabel(label);
  const tokenMatch = includeSourceDetails ? declarationMatchForToken(element, token, properties, options.state) : null;
  const elementMatch = includeSourceDetails ? declarationMatchForElement(element, properties, options.state) : null;
  const cssValue = options.cssValue || tokenMatch?.value || elementMatch?.value || "";
  const cssTokens = uniqueValues([token, ...(options.tokens || []), ...(tokenMatch?.tokens || []), ...(elementMatch?.tokens || [])]);
  const colorInfo = includeSourceDetails
    ? resolvedCssColor(element, cssValue, color)
    : {
        cssVariable: "",
        cssVariables: [],
        rgb: rgbString(color),
        hex: hexString(color),
        color: rgbString(color) || color
      };
  const value = [cssTokens.join(", "), colorInfo.cssVariables.join(", "), colorInfo.rgb, colorInfo.hex].filter(Boolean).join(" | ");
  return {
    type: "color",
    label,
    state: options.state || "",
    token: cssTokens.join(", "),
    cssVariable: colorInfo.cssVariable,
    cssVariables: colorInfo.cssVariables,
    rgb: colorInfo.rgb,
    hex: colorInfo.hex,
    value: value || color,
    color: colorInfo.color,
    raw
  };
}

function visibleColorMetricRow(element, label, prefixes, color, raw = color, options = {}) {
  const row = colorMetricRow(element, label, prefixes, color, raw, options);
  return isVisibleColor(row.color) ? row : null;
}

function pseudoColorRows(element) {
  const rows = [];
  const seen = new Set();
  const tokens = getClassTokens(element);
  const groups = [
    { label: "text", properties: colorPropertiesForLabel("text") },
    { label: "bg", properties: colorPropertiesForLabel("bg") },
    { label: "border", properties: colorPropertiesForLabel("border") },
    { label: "shadow", properties: colorPropertiesForLabel("shadow") }
  ];

  for (const rule of cssRulesFromDocument(element?.ownerDocument || globalThis.document)) {
    for (const selector of splitSelectorList(rule.selectorText)) {
      const state = selectorState(selector);
      if (!state || !selectorMatchesElementState(element, selector, state)) {
        continue;
      }

      const token = tokens.find((item) => selectorHasToken(selector, item)) || "";
      for (const group of groups) {
        const cssValue = group.properties.map((property) => stylePropertyValue(rule.style, property)).find(Boolean);
        if (!cssValue) {
          continue;
        }

        const color =
          group.label === "shadow" ? extractShadowColor(cssValue) : resolvedCssColor(element, cssValue, cssValue).color;
        if (!isVisibleColor(color)) {
          continue;
        }

        const key = `${state}:${group.label}:${selector}:${cssValue}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        rows.push(colorMetricRow(element, group.label, [], color, cssValue, {
          state,
          token,
          cssValue,
          includeSourceDetails: true
        }));
      }
    }
  }

  return rows;
}

function roundedSize(value) {
  const number = toNumber(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function displayedLength(styleValue, rectValue) {
  const styleNumber = toNumber(styleValue);
  if (styleNumber > 0) {
    return roundedSize(styleNumber);
  }

  const rectNumber = toNumber(rectValue);
  return rectNumber > 0 ? roundedSize(rectNumber) : "";
}

function displayedSize(element, style) {
  const rect = getRect(element);
  return {
    width: displayedLength(style?.width, rect.width),
    height: displayedLength(style?.height, rect.height)
  };
}

const SIZE_DETAIL_PROPERTIES = [
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "line-height",
  "font-size"
];

const PADDING_DETAIL_PROPERTIES = ["padding-left", "padding-right", "padding-top", "padding-bottom"];

function variableLengthDisplay(element, name, style, fallbackValue) {
  const rawValue = customPropertyValue(element, name);
  const resolved = resolvedLengthTokenValue(rawValue, element, style);
  const value = fallbackValue || resolved || rawValue;
  return `${name}${value ? ` (${value})` : ""}`;
}

function resolvedDeclarationLengthValue(element, cssValue, style, computedValue) {
  const variables = cssVariableNames(cssValue);
  if (variables.length) {
    return (
      variables
        .map((name) => resolvedLengthTokenValue(customPropertyValue(element, name), element, style))
        .find(Boolean) ||
      computedValue ||
      ""
    );
  }

  return resolvedLengthTokenValue(cssValue, element, style);
}

function lengthDeclarationMatchesComputed(element, cssValue, style, computedValue) {
  const resolved = resolvedDeclarationLengthValue(element, cssValue, style, computedValue);
  if (!resolved || !computedValue) {
    return true;
  }

  return Math.abs(toNumber(resolved) - toNumber(computedValue)) < 0.01;
}

function lengthDeclarationSummaries(element, style, properties) {
  const summariesByProperty = new Map();
  const requestedProperties = new Set(properties);
  const variableBackedProperties = new Set();

  function declarationDisplay(cssValue, computedValue) {
    const variables = cssVariableNames(cssValue);
    if (variables.length) {
      return variables.map((name) => variableLengthDisplay(element, name, style, computedValue)).join(", ");
    }
    return `${cssValue}${computedValue && computedValue !== cssValue ? ` (${computedValue})` : ""}`;
  }

  function setSummary(property, cssValue, computedValue) {
    if (!cssValue) {
      return;
    }
    if (!lengthDeclarationMatchesComputed(element, cssValue, style, computedValue)) {
      return;
    }

    const hasVariables = cssVariableNames(cssValue).length > 0;
    if (!hasVariables && variableBackedProperties.has(property)) {
      return;
    }

    const summary = `${property}: ${declarationDisplay(cssValue, computedValue)}`;
    summariesByProperty.set(property, summary);
    if (hasVariables) {
      variableBackedProperties.add(property);
    }
  }

  function splitDeclarationTokens(value) {
    const tokens = [];
    let current = "";
    let depth = 0;

    for (const char of String(value || "").trim()) {
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth = Math.max(0, depth - 1);
      }

      if (/\s/.test(char) && depth === 0) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (current) {
      tokens.push(current);
    }
    return tokens;
  }

  function expandedBoxValue(cssValue, side) {
    const tokens = splitDeclarationTokens(cssValue);
    if (!tokens.length) {
      return "";
    }

    const [top, right = top, bottom = top, left = right] = tokens;
    return { top, right, bottom, left }[side] || "";
  }

  function setBoxShorthandSummaries(property, cssValue) {
    const sides = [
      ["top", `${property}-top`],
      ["right", `${property}-right`],
      ["bottom", `${property}-bottom`],
      ["left", `${property}-left`]
    ];

    for (const [side, longhand] of sides) {
      if (!requestedProperties.has(longhand)) {
        continue;
      }
      const expandedValue = expandedBoxValue(cssValue, side) || cssValue;
      setSummary(longhand, expandedValue, stylePropertyValue(style, longhand));
    }
  }

  for (const rule of cssRulesFromDocument(element?.ownerDocument || globalThis.document)) {
    for (const selector of splitSelectorList(rule.selectorText)) {
      const state = selectorState(selector);
      if (state || !selectorMatchesElement(element, selector)) {
        continue;
      }

      for (const property of properties) {
        const cssValue = stylePropertyValue(rule.style, property);
        if (!cssValue) {
          continue;
        }

        setSummary(property, cssValue, stylePropertyValue(style, property));
      }

      for (const property of ["padding", "margin"]) {
        const cssValue = stylePropertyValue(rule.style, property);
        if (cssValue) {
          setBoxShorthandSummaries(property, cssValue);
        }
      }
    }
  }

  return properties.map((property) => summariesByProperty.get(property)).filter(Boolean);
}

function sizeDeclarationSummaries(element, style) {
  return lengthDeclarationSummaries(element, style, SIZE_DETAIL_PROPERTIES);
}

function sizeMetricValue(element, style, width, height, options = {}) {
  const sizeText = tokenListValue(element, ["size-", "w-", "h-"], `${width}×${height}`, style);
  if (!options.includeSourceDetails) {
    return sizeText;
  }
  return uniqueValues([sizeText, ...sizeDeclarationSummaries(element, style)]).join(" | ");
}

function tokenValueWithDeclarations(element, prefixes, value, style, properties, options = {}) {
  if (!options.includeSourceDetails) {
    return tokenValue(element, prefixes, value, style);
  }

  return uniqueValues([
    tokenValue(element, prefixes, value, style),
    ...lengthDeclarationSummaries(element, style, properties)
  ]).join(" | ");
}

function primaryFontFamily(fontFamily) {
  const text = String(fontFamily || "").trim();
  if (!text) {
    return "";
  }

  let current = "";
  let quote = "";
  for (const char of text) {
    if ((char === "\"" || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = "";
      continue;
    }
    if (char === "," && !quote) {
      break;
    }
    current += char;
  }

  return current.trim();
}

function fontMetricValue(style) {
  const family = primaryFontFamily(style.fontFamily);
  return [
    style.fontSize ? `font-size ${style.fontSize}` : "",
    family ? `font-family ${family}` : "",
    style.lineHeight ? `line-height ${style.lineHeight}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function sideValues(style, property) {
  return {
    top: style[`${property}Top`] || "0px",
    right: style[`${property}Right`] || "0px",
    bottom: style[`${property}Bottom`] || "0px",
    left: style[`${property}Left`] || "0px"
  };
}

function borderWidthValues(style) {
  return {
    top: style.borderTopWidth || "0px",
    right: style.borderRightWidth || "0px",
    bottom: style.borderBottomWidth || "0px",
    left: style.borderLeftWidth || "0px"
  };
}

function mapSides(values, mapper) {
  return {
    top: mapper(values.top, "top"),
    right: mapper(values.right, "right"),
    bottom: mapper(values.bottom, "bottom"),
    left: mapper(values.left, "left")
  };
}

function signatureClass(element) {
  return getClassTokens(element)
    .filter((token) => !/^(is-|has-|active|selected|current|hover|focus|disabled)/.test(token))
    .sort()
    .join(".");
}

function elementSignature(element) {
  const parent = element?.parentElement;
  const parentTag = String(parent?.tagName || "").toUpperCase();
  const parentClass = signatureClass(parent);
  const tag = String(element?.tagName || "").toUpperCase();
  const className = signatureClass(element);
  return `${parentTag}.${parentClass}>${tag}.${className}`;
}

function rowSignature(item) {
  if (!Array.isArray(item?.rows) || !item.rows.length) {
    return "";
  }

  if (item.rows.every((row) => row.type === "size")) {
    return "size";
  }

  return item.rows
    .map((row) => `${row.type || ""}:${row.label || ""}:${row.value || ""}`)
    .join("|");
}

function similarSizeSignature(item) {
  const rect = item?.rect || getRect(item?.element || item);
  const width = Math.round(toNumber(rect.width) / 16);
  const height = Math.round(toNumber(rect.height) / 16);
  return `${width}x${height}`;
}

function repeatedSignature(item) {
  const element = item.element || item;
  const metrics = rowSignature(item);
  const base = elementSignature(element);

  if (metrics) {
    return `${base}|${similarSizeSignature(item)}|${metrics}`;
  }

  if (isListLikeElement(element)) {
    return base;
  }

  return "";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function labelSize(label, labelSizePx) {
  const lines = String(label || "")
    .split(/\n+/)
    .filter(Boolean);
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const rowCount = Math.max(1, lines.length);
  const width = clamp(Math.round(longestLine * labelSizePx * 0.62 + 22), 74, 280);
  return {
    width,
    height: Math.round(rowCount * labelSizePx * 1.55 + 12)
  };
}

function overlaps(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

function rectRight(rect) {
  return rect.left + rect.width;
}

function rectBottom(rect) {
  return rect.top + rect.height;
}

export function boxSideRects(rect, sides, mode = "outside") {
  const box = {
    left: toNumber(rect?.left),
    top: toNumber(rect?.top),
    width: toNumber(rect?.width),
    height: toNumber(rect?.height)
  };
  const values = {
    top: toNumber(sides?.top),
    right: toNumber(sides?.right),
    bottom: toNumber(sides?.bottom),
    left: toNumber(sides?.left)
  };
  const rects = [];

  function push(side, left, top, width, height) {
    const value = values[side];
    if (value <= 0 || width <= 0 || height <= 0) {
      return;
    }
    rects.push({ side, value, left, top, width, height });
  }

  if (mode === "inside") {
    push("top", box.left, box.top, box.width, values.top);
    push("right", box.left + box.width - values.right, box.top, values.right, box.height);
    push("bottom", box.left, box.top + box.height - values.bottom, box.width, values.bottom);
    push("left", box.left, box.top, values.left, box.height);
    return rects;
  }

  push("top", box.left - values.left, box.top - values.top, box.width + values.left + values.right, values.top);
  push("right", box.left + box.width, box.top, values.right, box.height);
  push("bottom", box.left - values.left, box.top + box.height, box.width + values.left + values.right, values.bottom);
  push("left", box.left - values.left, box.top, values.left, box.height);
  return rects;
}

function normalizeRect(rect) {
  const left = toNumber(rect?.left);
  const top = toNumber(rect?.top);
  const width = toNumber(rect?.width);
  const height = toNumber(rect?.height);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

function markerRect(slot, orientation) {
  return {
    orientation,
    left: Math.round(slot.left),
    top: Math.round(slot.top),
    width: Math.max(1, Math.round(slot.width)),
    height: Math.max(1, Math.round(slot.height))
  };
}

export function gapMarkerRects(childRects, options = {}) {
  const maxMarkers = options.maxMarkers || 80;
  const rects = (Array.isArray(childRects) ? childRects : [])
    .map(normalizeRect)
    .filter((rect) => rect.width >= 2 && rect.height >= 2);
  const markers = [];
  const seen = new Set();

  function slotContainsChild(slot, firstIndex, secondIndex) {
    const slotRect = normalizeRect(slot);
    return rects.some(
      (rect, index) =>
        index !== firstIndex &&
        index !== secondIndex &&
        slotRect.left < rect.right &&
        slotRect.right > rect.left &&
        slotRect.top < rect.bottom &&
        slotRect.bottom > rect.top
    );
  }

  function push(slot, orientation, firstIndex, secondIndex) {
    if (slot.width <= 0 || slot.height <= 0 || markers.length >= maxMarkers) {
      return;
    }
    if (slotContainsChild(slot, firstIndex, secondIndex)) {
      return;
    }

    const marker = markerRect(slot, orientation);
    const signature = `${marker.orientation}:${marker.left}:${marker.top}:${marker.width}:${marker.height}`;
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    markers.push(marker);
  }

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (verticalOverlap > 1) {
        const leftRect = a.right <= b.left ? a : b.right <= a.left ? b : null;
        const rightRect = leftRect === a ? b : leftRect === b ? a : null;
        const gap = rightRect ? rightRect.left - leftRect.right : 0;
        push(
          {
            left: leftRect?.right || 0,
            top: Math.max(a.top, b.top),
            width: gap,
            height: verticalOverlap
          },
          "column",
          i,
          j
        );
      }

      const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (horizontalOverlap > 1) {
        const topRect = a.bottom <= b.top ? a : b.bottom <= a.top ? b : null;
        const bottomRect = topRect === a ? b : topRect === b ? a : null;
        const gap = bottomRect ? bottomRect.top - topRect.bottom : 0;
        push(
          {
            left: Math.max(a.left, b.left),
            top: topRect?.bottom || 0,
            width: horizontalOverlap,
            height: gap
          },
          "row",
          i,
          j
        );
      }
    }
  }

  return markers;
}

function outsideRect(rect, boundary) {
  return (
    rectRight(rect) <= boundary.left ||
    rect.left >= rectRight(boundary) ||
    rectBottom(rect) <= boundary.top ||
    rect.top >= rectBottom(boundary)
  );
}

function shiftedPositions(base, min, max, step) {
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  const positions = [];
  const seen = new Set();

  for (const offset of offsets) {
    const value = Math.round(clamp(base + offset * step, min, max));
    if (!seen.has(value)) {
      seen.add(value);
      positions.push(value);
    }
  }

  return positions;
}

function candidateLabelRects(rect, size, viewport, gap) {
  const maxLeft = viewport.width - size.width - gap;
  const maxTop = viewport.height - size.height - gap;
  return [
    {
      position: "top",
      left: clamp(rect.left, gap, maxLeft),
      top: clamp(rect.top - size.height - gap, gap, maxTop),
      width: size.width,
      height: size.height
    },
    {
      position: "right",
      left: clamp(rect.left + rect.width + gap, gap, maxLeft),
      top: clamp(rect.top, gap, maxTop),
      width: size.width,
      height: size.height
    },
    {
      position: "bottom",
      left: clamp(rect.left, gap, maxLeft),
      top: clamp(rect.top + rect.height + gap, gap, maxTop),
      width: size.width,
      height: size.height
    },
    {
      position: "left",
      left: clamp(rect.left - size.width - gap, gap, maxLeft),
      top: clamp(rect.top, gap, maxTop),
      width: size.width,
      height: size.height
    }
  ];
}

function overlapsAny(rect, others = []) {
  return others.some((other) => overlaps(rect, other));
}

function externalLabelRects(rect, size, viewport, boundary, gap, avoidRects = []) {
  const maxLeft = viewport.width - size.width - gap;
  const maxTop = viewport.height - size.height - gap;
  const rectCenterX = rect.left + rect.width / 2 - size.width / 2;
  const rectCenterY = rect.top + rect.height / 2 - size.height / 2;
  const verticalPositions = shiftedPositions(rectCenterY, gap, maxTop, size.height + 4);
  const horizontalPositions = shiftedPositions(rectCenterX, gap, maxLeft, size.width + 4);
  const candidates = [];

  const push = (position, left, top) => {
    const candidate = {
      position,
      left,
      top,
      width: size.width,
      height: size.height
    };
    if (outsideRect(candidate, boundary) && !overlapsAny(candidate, avoidRects)) {
      candidates.push(candidate);
    }
  };

  const rightLeft = rectRight(boundary) + gap;
  if (rightLeft <= maxLeft) {
    for (const top of verticalPositions) {
      push("right", rightLeft, top);
    }
  }

  const leftLeft = boundary.left - size.width - gap;
  if (leftLeft >= gap) {
    for (const top of verticalPositions) {
      push("left", leftLeft, top);
    }
  }

  const bottomTop = rectBottom(boundary) + gap;
  if (bottomTop <= maxTop) {
    for (const left of horizontalPositions) {
      push("bottom", left, bottomTop);
    }
  }

  const topTop = boundary.top - size.height - gap;
  if (topTop >= gap) {
    for (const left of horizontalPositions) {
      push("top", left, topTop);
    }
  }

  return candidates;
}

function isListLikeElement(element) {
  const tag = String(element?.tagName || "").toUpperCase();
  if (["LI", "TR", "OPTION"].includes(tag)) {
    return true;
  }
  const parent = String(element?.parentElement?.tagName || "").toUpperCase();
  return ["UL", "OL", "TBODY", "THEAD", "TFOOT"].includes(parent);
}

export function shouldInspectElement(element) {
  const tagName = String(element?.tagName || "").toUpperCase();
  if (!tagName || SKIPPED_TAGS.has(tagName)) {
    return false;
  }

  const rect = getRect(element);
  if (toNumber(rect.width) < 2 || toNumber(rect.height) < 2) {
    return false;
  }

  const style = getStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
    return false;
  }
  if (toNumber(style.opacity || 1) === 0) {
    return false;
  }

  return true;
}

export function createBoxModel(element, style, settings) {
  const includeSourceDetails = settings?.includeSourceDetails === true;
  const paddingValues = sideValues(style, "padding");
  const marginValues = sideValues(style, "margin");
  const borderValues = borderWidthValues(style);
  const paddingList = Object.values(paddingValues);
  const marginList = Object.values(marginValues);
  const borderList = Object.values(borderValues);
  const { width, height } = displayedSize(element, style);
  const rowGap = style.rowGap || style.gap || "normal";
  const columnGap = style.columnGap || style.gap || "normal";

  return {
    size:
      metricEnabled(settings, "showSize") && width && height
        ? {
            type: "size",
            value: sizeMetricValue(element, style, width, height, { includeSourceDetails }),
            width,
            height
          }
        : null,
    padding:
      metricEnabled(settings, "showPadding") && hasUsefulSpacing(...paddingList)
        ? mapSides(paddingValues, (value, side) =>
            sideTokenValue(
              element,
              side === "top"
                ? ["pt-", "padding-t-", "p-"]
                : side === "right"
                  ? ["pr-", "px-", "padding-r-"]
                  : side === "bottom"
                    ? ["pb-", "padding-b-", "p-"]
                    : ["pl-", "px-", "padding-l-"],
              ["p-", "padding-"],
              value,
              paddingList,
              style,
              [
                side === "top"
                  ? "padding-top"
                  : side === "right"
                    ? "padding-right"
                    : side === "bottom"
                      ? "padding-bottom"
                      : "padding-left"
              ],
              { includeSourceDetails }
            )
          )
        : null,
    margin:
      metricEnabled(settings, "showMargin") && hasUsefulSpacing(...marginList)
        ? mapSides(marginValues, (value, side) =>
            sideTokenValue(
              element,
              side === "top"
                ? ["mt-", "my-", "margin-t-", "m-"]
                : side === "right"
                  ? ["mr-", "mx-", "margin-r-"]
                  : side === "bottom"
                    ? ["mb-", "my-", "margin-b-", "m-"]
                    : ["ml-", "mx-", "margin-l-"],
              ["m-", "margin-"],
              value,
              marginList,
              style
            )
          )
        : null,
    border:
      metricEnabled(settings, "showBorder") && hasUsefulSpacing(...borderList)
        ? mapSides(borderValues, (value, side) =>
            sideTokenValue(
              element,
              side === "top"
                ? ["border-t-", "border-"]
                : side === "right"
                  ? ["border-r-"]
                  : side === "bottom"
                    ? ["border-b-", "border-"]
                    : ["border-l-"],
              ["border-"],
              value,
              borderList,
              style
            )
          )
        : null,
    gap:
      metricEnabled(settings, "showGap") && ((rowGap && rowGap !== "normal") || (columnGap && columnGap !== "normal"))
        ? {
            row: tokenValue(element, ["gap-y-", "gap-", "gap"], rowGap, style),
            column: tokenValue(element, ["gap-x-", "gap-", "gap"], columnGap, style)
          }
        : null
  };
}

export function dedupeRepeatedElements(items) {
  const seen = new Set();

  return items.filter((item) => {
    const signature = repeatedSignature(item);
    if (!signature) {
      return true;
    }

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

export function filterInformativeItems(items, settings = {}) {
  if (settings.showColor || !metricEnabled(settings, "showSize")) {
    return items;
  }

  const hasRicherMetric = items.some((item) => item.rows?.some((row) => row.type && row.type !== "size"));
  const sizeIsSupportingMetric =
    metricEnabled(settings, "showPadding") ||
    metricEnabled(settings, "showMargin") ||
    metricEnabled(settings, "showBorder") ||
    metricEnabled(settings, "showGap");

  if (!hasRicherMetric || !sizeIsSupportingMetric) {
    return items;
  }

  return items.filter(
    (item) => item.rows?.some((row) => row.type && row.type !== "size") || isIconLikeElement(item.element)
  );
}

export function planLabelPlacements(items, options = {}) {
  const viewport = {
    width: options.viewportWidth || 1024,
    height: options.viewportHeight || 768
  };
  const labelSizePx = options.labelSize || 11;
  const gap = options.gap || 5;
  const occupied = [];
  const avoidRects = Array.isArray(options.avoidRects) ? options.avoidRects : [];

  return items.map((item, index) => {
    const size = labelSize(item.label, labelSizePx);
    const externalCandidates = options.avoidRect
      ? externalLabelRects(item.rect, size, viewport, options.avoidRect, gap, avoidRects)
      : [];
    const outsideFallbackCandidates = options.avoidRect
      ? [
          ...externalLabelRects(item.rect, size, viewport, options.avoidRect, gap, []),
          ...candidateLabelRects(item.rect, size, viewport, gap).filter((candidate) =>
            outsideRect(candidate, options.avoidRect)
          )
        ]
      : [];
    const fallbackCandidates = candidateLabelRects(item.rect, size, viewport, gap);
    const candidates = externalCandidates.length
      ? [
          ...externalCandidates,
          ...fallbackCandidates.filter(
            (candidate) => outsideRect(candidate, options.avoidRect) && !overlapsAny(candidate, avoidRects)
          )
        ]
      : fallbackCandidates.filter((candidate) => !overlapsAny(candidate, avoidRects));
    const placement =
      candidates.find((candidate) => !occupied.some((taken) => overlaps(candidate, taken))) ||
      outsideFallbackCandidates.find((candidate) => !occupied.some((taken) => overlaps(candidate, taken))) ||
      outsideFallbackCandidates[0] ||
      fallbackCandidates.find(
        (candidate) => !overlapsAny(candidate, avoidRects) && (!options.avoidRect || outsideRect(candidate, options.avoidRect))
      ) ||
      {
        ...fallbackCandidates[0],
        top: clamp(fallbackCandidates[0].top + (index % 8) * (size.height + 3), gap, viewport.height - size.height - gap)
      };

    occupied.push(placement);
    return placement;
  });
}

export function createMetricRows(element, style, settings) {
  const rows = [];
  const includeSourceDetails = settings?.includeSourceDetails === true;

  if (settings.showColor) {
    const textRow = visibleColorMetricRow(element, "text", ["text-"], style.color, style.color, {
      includeSourceDetails
    });
    if (textRow) {
      rows.push(textRow);
    }
    const bgRow = visibleColorMetricRow(element, "bg", ["bg-"], style.backgroundColor, style.backgroundColor, {
      includeSourceDetails
    });
    if (bgRow) {
      rows.push(bgRow);
    }
    if (hasVisibleBorder(style)) {
      const borderRow = visibleColorMetricRow(element, "border", ["border-"], style.borderTopColor, style.borderTopColor, {
        includeSourceDetails
      });
      if (borderRow) {
        rows.push(borderRow);
      }
    }
    if (style.boxShadow && style.boxShadow !== "none") {
      rows.push(
        colorMetricRow(
          element,
          "shadow",
          ["shadow-"],
          extractShadowColor(style.boxShadow),
          style.boxShadow,
          { includeSourceDetails }
        )
      );
    }
    if (includeSourceDetails) {
      rows.push(...pseudoColorRows(element));
    }
    return rows;
  }

  if (
    metricEnabled(settings, "showPadding") &&
    hasUsefulSpacing(style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft)
  ) {
    const value = compactSides(
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft
    );
    rows.push({
      type: "padding",
      label: "padding",
      value: tokenValueWithDeclarations(
        element,
        ["p-", "px-", "py-", "pt-", "pr-", "pb-", "pl-", "padding-"],
        value,
        style,
        PADDING_DETAIL_PROPERTIES,
        { includeSourceDetails }
      )
    });
  }

  if (
    metricEnabled(settings, "showMargin") &&
    hasUsefulSpacing(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft)
  ) {
    const value = compactSides(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft);
    rows.push({
      type: "margin",
      label: "margin",
      value: tokenValue(element, ["m-", "mx-", "my-", "mt-", "mr-", "mb-", "ml-", "margin-"], value, style)
    });
  }

  if (
    metricEnabled(settings, "showBorder") &&
    hasUsefulSpacing(style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth)
  ) {
    const value = compactSides(style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth);
    rows.push({
      type: "border",
      label: "border",
      value: tokenValue(
        element,
        ["border-", "border-t-", "border-r-", "border-b-", "border-l-"],
        value,
        style
      )
    });
  }

  const rowGap = style.rowGap || style.gap;
  const columnGap = style.columnGap || style.gap;
  const gapValue = rowGap && columnGap && rowGap !== columnGap ? `${rowGap} ${columnGap}` : rowGap || columnGap || style.gap;
  if (metricEnabled(settings, "showGap") && gapValue && gapValue !== "normal") {
    rows.push({
      type: "gap",
      label: "gap",
      value: tokenValue(element, ["gap-", "gap-x-", "gap-y-", "gap"], gapValue, style)
    });
  }

  if (settings?.showFont === true) {
    const value = fontMetricValue(style);
    if (value) {
      rows.push({
        type: "font",
        label: "font",
        value
      });
    }
  }

  if (metricEnabled(settings, "showSize")) {
    const { width, height } = displayedSize(element, style);
    if (width && height) {
      rows.push({
        type: "size",
        label: "size",
        value: sizeMetricValue(element, style, width, height, { includeSourceDetails })
      });
    }
  }

  return rows;
}
