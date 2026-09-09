const DEFAULT_GROUP_NAME = "未分组";
const DEFAULT_GROUP_ICONS = ["📁", "📂", "🗂️", "📌", "🧩", "📝", "💡", "🎈"];
const DEFAULT_GROUP_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#14b8a6", "#ef4444", "#6366f1"];
const KNOWN_TITLE_SUFFIXES = new Set([
  "github",
  "gitlab",
  "openai",
  "google",
  "google docs",
  "stack overflow",
  "youtube",
  "mdn web docs",
  "microsoft learn",
  "notion",
  "figma",
  "reddit",
  "x",
  "twitter",
  "jira",
  "confluence",
  "npm"
]);

export function createEmptyData() {
  return { version: 1, groups: [] };
}

export function normalizeData(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.groups)) {
    return createEmptyData();
  }

  return {
    version: Number.isInteger(input.version) ? input.version : 1,
    groups: input.groups
      .map(normalizeGroup)
      .filter((group) => group.name && Array.isArray(group.pages))
  };
}

export function cleanPageTitle(title, fallbackUrl = "") {
  const original = String(title || "").trim();
  const fallback = titleFromUrl(fallbackUrl);
  if (!original) return fallback;

  const separators = [" - ", " | ", " — ", " – "];
  for (const separator of separators) {
    const index = original.lastIndexOf(separator);
    if (index <= 0) continue;

    const prefix = original.slice(0, index).trim();
    const suffix = original.slice(index + separator.length).trim().toLowerCase();
    if (prefix.length >= 2 && KNOWN_TITLE_SUFFIXES.has(suffix)) {
      return prefix;
    }
  }

  return original.length >= 2 ? original : fallback;
}

export function createPageDraft(tab) {
  const url = normalizeUrl(tab?.url || "");
  return {
    title: cleanPageTitle(tab?.title || "", url),
    url,
    domain: domainFromUrl(url)
  };
}

export function addPageToGroup(data, request) {
  const source = normalizeData(data);
  const url = normalizeUrl(request?.url || "");
  if (!url) {
    return {
      status: "error",
      message: "页面地址无效",
      data: source
    };
  }

  const now = new Date().toISOString();
  const groupId = String(request?.groupId || "").trim();
  const groupName = String(request?.groupName || DEFAULT_GROUP_NAME).trim() || DEFAULT_GROUP_NAME;
  const pageTitle = String(request?.pageTitle || "").trim() || cleanPageTitle("", url);
  const groups = source.groups.map(cloneGroup);
  let group = groupId ? groups.find((item) => item.id === groupId) : null;
  if (!group) {
    group = groups.find((item) => item.name.toLowerCase() === groupName.toLowerCase());
  }

  if (!group) {
    group = {
      id: createId("group"),
      name: groupName,
      icon: pickRandom(DEFAULT_GROUP_ICONS),
      color: pickRandom(DEFAULT_GROUP_COLORS),
      createdAt: now,
      updatedAt: now,
      pages: [],
      children: []
    };
    groups.push(group);
  }

  const targetDuplicate = group.pages.find((page) => page.url === url);
  if (targetDuplicate) {
    return {
      status: "duplicate",
      existingGroupId: group.id,
      existingGroupName: group.name,
      page: targetDuplicate,
      data: source
    };
  }

  const duplicate = findPageByUrl({ version: source.version, groups }, url);
  if (duplicate) {
    const movingPage = { ...clonePage(duplicate.page), updatedAt: now };
    const nextGroups = groups.map((item) => {
      if (item.id === duplicate.group.id) {
        return {
          ...item,
          pages: item.pages.filter((page) => page.id !== duplicate.page.id),
          updatedAt: now
        };
      }
      if (item.id === group.id) {
        return {
          ...item,
          pages: [...item.pages, movingPage],
          updatedAt: now
        };
      }
      return item;
    });
    const targetGroup = nextGroups.find((item) => item.id === group.id);
    return {
      status: "moved",
      previousGroupId: duplicate.group.id,
      previousGroupName: duplicate.group.name,
      group: targetGroup,
      page: movingPage,
      data: { version: source.version, groups: nextGroups }
    };
  }

  const page = {
    id: createId("page"),
    name: pageTitle,
    title: pageTitle,
    url,
    domain: domainFromUrl(url),
    createdAt: now,
    updatedAt: now,
    openCount: 0,
    quickAccessPinned: false,
    tags: []
  };
  group.pages.push(page);
  group.updatedAt = now;

  return {
    status: "saved",
    group,
    page,
    data: { version: source.version, groups }
  };
}

export function getQuickAccessPages(data, limit = 5) {
  const source = normalizeData(data);
  const pages = source.groups.flatMap((group) =>
    group.pages.map((page) => ({
      ...clonePage(page),
      groupId: group.id,
      groupName: group.name
    }))
  );

  return pages
    .filter((page) => page.quickAccessPinned)
    .sort((left, right) => {
      if (left.openCount !== right.openCount) return right.openCount - left.openCount;
      return String(right.lastOpenedAt || "").localeCompare(String(left.lastOpenedAt || ""));
    })
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function incrementPageOpenCount(data, pageId, openedAt = new Date().toISOString()) {
  const source = normalizeData(data);
  return {
    ...source,
    groups: source.groups.map((group) => {
      const pages = group.pages.map((page) =>
        page.id === pageId
          ? {
              ...clonePage(page),
              openCount: page.openCount + 1,
              lastOpenedAt: openedAt,
              updatedAt: openedAt
            }
          : clonePage(page)
      );
      return { ...cloneGroup(group), pages };
    })
  };
}

export function setQuickAccessPinned(data, pageId, pinned) {
  const source = normalizeData(data);
  const now = new Date().toISOString();
  return {
    ...source,
    groups: source.groups.map((group) => {
      const pages = group.pages.map((page) =>
        page.id === pageId
          ? {
              ...clonePage(page),
              quickAccessPinned: Boolean(pinned),
              updatedAt: now
            }
          : clonePage(page)
      );
      return { ...cloneGroup(group), pages };
    })
  };
}

export function searchTree(data, query) {
  const source = normalizeData(data);
  const value = String(query || "").trim().toLowerCase();
  if (!value) return source.groups.map(cloneGroup);

  return source.groups.reduce((results, group) => {
    const groupMatches = group.name.toLowerCase().includes(value);
    const pages = groupMatches
      ? group.pages.map(clonePage)
      : group.pages.filter((page) => pageMatches(page, value)).map(clonePage);

    if (groupMatches || pages.length > 0) {
      results.push({ ...cloneGroup(group), pages });
    }
    return results;
  }, []);
}

export function renameGroup(data, groupId, name) {
  const source = normalizeData(data);
  const nextName = String(name || "").trim();
  if (!nextName) return source;
  const now = new Date().toISOString();

  return {
    ...source,
    groups: source.groups.map((group) =>
      group.id === groupId ? { ...cloneGroup(group), name: nextName, updatedAt: now } : cloneGroup(group)
    )
  };
}

export function updateGroupAppearance(data, groupId, patch) {
  const source = normalizeData(data);
  const now = new Date().toISOString();
  const changes = patch && typeof patch === "object" ? patch : {};
  const hasIcon = Object.hasOwn(changes, "icon");
  const hasColor = Object.hasOwn(changes, "color");

  return {
    ...source,
    groups: source.groups.map((group) =>
      group.id === groupId
        ? {
            ...cloneGroup(group),
            icon: hasIcon ? sanitizeIcon(changes.icon) : group.icon,
            color: hasColor ? sanitizeColor(changes.color) : group.color,
            updatedAt: now
          }
        : cloneGroup(group)
    )
  };
}

export function deleteGroup(data, groupId) {
  const source = normalizeData(data);
  return {
    ...source,
    groups: source.groups.filter((group) => group.id !== groupId).map(cloneGroup)
  };
}

export function renamePage(data, pageId, title) {
  const source = normalizeData(data);
  const nextName = String(title || "").trim();
  if (!nextName) return source;
  const now = new Date().toISOString();

  return {
    ...source,
    groups: source.groups.map((group) => {
      const pages = group.pages.map((page) =>
        page.id === pageId ? { ...clonePage(page), name: nextName, updatedAt: now } : clonePage(page)
      );
      const changed = pages.some((page, index) => page !== group.pages[index]);
      return changed ? { ...cloneGroup(group), pages, updatedAt: now } : { ...cloneGroup(group), pages };
    })
  };
}

export function deletePage(data, pageId) {
  const source = normalizeData(data);
  const now = new Date().toISOString();

  return {
    ...source,
    groups: source.groups.map((group) => {
      const pages = group.pages.filter((page) => page.id !== pageId).map(clonePage);
      return pages.length === group.pages.length
        ? { ...cloneGroup(group), pages }
        : { ...cloneGroup(group), pages, updatedAt: now };
    })
  };
}

export function reorderGroups(data, sourceGroupId, targetGroupId, position = "before") {
  const source = normalizeData(data);
  const groups = source.groups.map(cloneGroup);
  const nextGroups = reorderItems(groups, sourceGroupId, targetGroupId, position, (group) => group.id);
  if (nextGroups === groups) return source;
  return { ...source, groups: nextGroups };
}

export function reorderPages(data, groupId, sourcePageId, targetPageId, position = "before") {
  const source = normalizeData(data);
  const now = new Date().toISOString();
  let changed = false;
  const groups = source.groups.map((group) => {
    const groupCopy = cloneGroup(group);
    if (group.id !== groupId) return groupCopy;

    const nextPages = reorderItems(groupCopy.pages, sourcePageId, targetPageId, position, (page) => page.id);
    if (nextPages === groupCopy.pages) return groupCopy;
    changed = true;
    return { ...groupCopy, pages: nextPages, updatedAt: now };
  });

  return changed ? { ...source, groups } : source;
}

export function movePageToGroup(data, pageId, targetGroupId) {
  const source = normalizeData(data);
  const targetGroup = source.groups.find((group) => group.id === targetGroupId);
  if (!targetGroup) return source;

  const now = new Date().toISOString();
  let movingPage = null;
  let sourceGroupId = "";
  const groupsWithoutPage = source.groups.map((group) => {
    const groupCopy = cloneGroup(group);
    const page = groupCopy.pages.find((item) => item.id === pageId);
    if (!page) return groupCopy;

    sourceGroupId = group.id;
    movingPage = { ...clonePage(page), updatedAt: now };
    return {
      ...groupCopy,
      pages: groupCopy.pages.filter((item) => item.id !== pageId),
      updatedAt: now
    };
  });

  if (!movingPage || sourceGroupId === targetGroupId) return source;

  return {
    ...source,
    groups: groupsWithoutPage.map((group) =>
      group.id === targetGroupId
        ? { ...group, pages: [...group.pages, movingPage], updatedAt: now }
        : group
    )
  };
}

function normalizeGroup(group) {
  if (!group || typeof group !== "object") return null;
  const now = new Date().toISOString();
  const name = String(group.name || "").trim();
  const pages = Array.isArray(group.pages)
    ? group.pages.map(normalizePage).filter(Boolean)
    : [];

  return {
    id: String(group.id || createId("group")),
    name,
    icon: sanitizeIcon(group.icon),
    color: sanitizeColor(group.color),
    createdAt: String(group.createdAt || now),
    updatedAt: String(group.updatedAt || group.createdAt || now),
    pages,
    children: Array.isArray(group.children) ? group.children : []
  };
}

function normalizePage(page) {
  if (!page || typeof page !== "object") return null;
  const url = normalizeUrl(page.url || "");
  if (!url) return null;
  const now = new Date().toISOString();
  const title = String(page.title || cleanPageTitle("", url)).trim();
  const name = String(page.name || title).trim();

  return {
    id: String(page.id || createId("page")),
    name,
    title,
    url,
    domain: String(page.domain || domainFromUrl(url)),
    createdAt: String(page.createdAt || now),
    updatedAt: String(page.updatedAt || page.createdAt || now),
    openCount: normalizeOpenCount(page.openCount),
    quickAccessPinned: page.quickAccessPinned === true,
    lastOpenedAt: page.lastOpenedAt ? String(page.lastOpenedAt) : "",
    tags: Array.isArray(page.tags) ? page.tags : []
  };
}

function cloneGroup(group) {
  return {
    ...group,
    pages: group.pages.map(clonePage),
    children: Array.isArray(group.children) ? [...group.children] : []
  };
}

function clonePage(page) {
  return {
    ...page,
    tags: Array.isArray(page.tags) ? [...page.tags] : []
  };
}

function reorderItems(items, sourceId, targetId, position, getId) {
  const sourceIndex = items.findIndex((item) => getId(item) === sourceId);
  const targetIndex = items.findIndex((item) => getId(item) === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;

  const nextItems = [...items];
  const [item] = nextItems.splice(sourceIndex, 1);
  const nextTargetIndex = nextItems.findIndex((candidate) => getId(candidate) === targetId);
  const insertIndex = position === "after" ? nextTargetIndex + 1 : nextTargetIndex;
  nextItems.splice(insertIndex, 0, item);
  return nextItems;
}

function pageMatches(page, query) {
  return [page.name, page.title, page.domain, page.url].some((field) =>
    String(field || "").toLowerCase().includes(query)
  );
}

function findPageByUrl(data, url) {
  for (const group of data.groups) {
    const page = group.pages.find((item) => item.url === url);
    if (page) return { group, page };
  }
  return null;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.href;
  } catch {
    return "";
  }
}

function normalizeOpenCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function sanitizeIcon(value) {
  const icon = String(value || "").trim();
  return Array.from(icon).slice(0, 4).join("");
}

function sanitizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "";
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function titleFromUrl(url) {
  const domain = domainFromUrl(url);
  return domain || "未命名页面";
}

function createId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function pickRandom(values) {
  return values[Math.floor(Math.random() * values.length)] || "";
}
