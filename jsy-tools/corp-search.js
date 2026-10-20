(() => {
  if (!globalThis.chrome?.storage?.local) return;
  if (globalThis.__jsyToolsCorpSearch) return;
  globalThis.__jsyToolsCorpSearch = true;
  const states = new WeakMap();
  let scheduled = false;
  let enabled = false;
  let settingChanged = false;

  function resetScroll(root) {
    root.scrollTop = 0;
    root.querySelectorAll('.corp-wrapper').forEach(list => { list.scrollTop = 0; });
  }

  function attach(list) {
    const grouped = list.classList.contains('dialog-content');
    const host = grouped ? list : list.parentElement;
    if (!host) return;
    host.querySelectorAll(':scope > .jsy-corp-search').forEach(node => node.remove());
    const box = document.createElement('div');
    box.className = 'jsy-corp-search';
    const field = document.createElement('div');
    field.className = 'jsy-corp-search-field';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linecap', 'round');
    icon.append(path);
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = grouped ? '搜索企业 / 团队名称' : '搜索企业名称';
    input.setAttribute('aria-label', input.placeholder);
    input.autocomplete = 'off';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '×';
    clear.setAttribute('aria-label', '清空企业搜索');
    clear.hidden = true;
    const empty = document.createElement('div');
    empty.className = 'jsy-corp-search-empty';
    empty.setAttribute('role', 'status');
    empty.hidden = true;
    field.append(icon, input, clear);
    box.append(field, empty);
    host.insertBefore(box, grouped ? host.querySelector(':scope > .corp-block') : list);
    list.setAttribute('data-jsy-corp-list', '');
    if (grouped) list.setAttribute('data-jsy-corp-grouped', '');
    const state = { box, input, clear, empty, grouped };
    states.set(list, state);
    input.addEventListener('input', () => { filter(list, state); resetScroll(list); });
    clear.addEventListener('click', () => {
      input.value = '';
      filter(list, state);
      resetScroll(list);
      input.focus();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') event.preventDefault();
      if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        clear.click();
      }
    });
    input.focus({ preventScroll: true });
    return state;
  }

  function filter(list, { input, clear, empty, grouped }) {
    const query = input.value.trim().toLocaleLowerCase();
    let count = 0;
    const groups = grouped ? [...list.querySelectorAll(':scope > .corp-block')] : [list];
    for (const [index, group] of groups.entries()) {
      let matchesInGroup = 0;
      const rows = grouped ? group.querySelectorAll(':scope > .corp-wrapper > .corp-item') : group.children;
      for (const row of rows) {
        const name = row.querySelector(grouped ? '.corp-name' : '.truncate');
        if (!name) continue;
        const matches = (name.textContent || '').toLocaleLowerCase().includes(query);
        row.toggleAttribute('data-jsy-corp-hidden', !matches);
        if (matches) matchesInGroup++;
      }
      if (grouped) {
        group.setAttribute('data-jsy-corp-group', index === groups.length - 1 ? 'last' : '');
        const noMatches = Boolean(query && !matchesInGroup);
        group.toggleAttribute('data-jsy-corp-group-empty', noMatches);
        // 加入/创建按钮属于原生操作，隐藏分组内容时仍保留。
        group.toggleAttribute('data-jsy-corp-hidden', noMatches && !group.querySelector(':scope > .corp-switch-btn'));
      }
      count += matchesInGroup;
    }
    clear.hidden = input.value.length === 0;
    const message = query && count === 0 ? `未找到匹配的${grouped ? '企业 / 团队' : '企业'}，请修改或清空搜索` : '';
    if (empty.textContent !== message) empty.textContent = message;
    empty.hidden = !message;
  }

  function update() {
    scheduled = false;
    const lists = [...document.querySelectorAll('.corps-container, .fx-switch-corp-dialog .dialog-content')]
      .filter(list => list.matches('.corps-container') || list.querySelector(':scope > .corp-block'));
    if (!enabled) {
      lists.forEach(list => {
        states.get(list)?.box.remove();
        states.delete(list);
        list.removeAttribute('data-jsy-corp-list');
        list.removeAttribute('data-jsy-corp-grouped');
        for (const attribute of ['data-jsy-corp-hidden', 'data-jsy-corp-group', 'data-jsy-corp-group-empty']) {
          list.querySelectorAll(`[${attribute}]`).forEach(node => node.removeAttribute(attribute));
        }
      });
      document.getElementById('jsy-corp-search-style')?.remove();
      return;
    }
    if (!lists.length) return;
    if (!document.getElementById('jsy-corp-search-style')) {
      const style = document.createElement('style');
      style.id = 'jsy-corp-search-style';
      style.textContent = `
        .jsy-corp-search { flex: none; margin-bottom: 8px; }
        .jsy-corp-search-field { display: flex; align-items: center; height: 34px; border: 1px solid var(--color-border, #d9dde7); border-radius: 6px; background: var(--color-bg-1, #fff); }
        .jsy-corp-search-field:focus-within { border-color: var(--color-primary, #00afa5); box-shadow: 0 0 0 2px #00afa51a; }
        .jsy-corp-search-field svg { flex: none; width: 16px; height: 16px; margin-left: 10px; color: var(--color-text-tertiary, #667085); }
        .jsy-corp-search-field input { flex: 1; width: 0; min-width: 0; height: 100%; padding: 0 8px; border: 0; outline: 0; border-radius: inherit; font: inherit; color: inherit; background: transparent; }
        .jsy-corp-search-field input::-webkit-search-cancel-button { display: none; }
        .jsy-corp-search-field button { flex: none; margin-right: 6px; padding: 2px 6px; border: 0; border-radius: 4px; background: transparent; color: var(--color-text-tertiary, #667085); font: inherit; cursor: pointer; }
        .jsy-corp-search-field button:focus-visible { outline: 2px solid var(--color-primary, #00afa5); }
        .jsy-corp-search-empty { padding: 16px 8px; text-align: center; color: var(--color-text-tertiary, #667085); font-size: 13px; }
        [data-jsy-corp-list] { min-height: 0; }
        .fx-switch-corp-dialog [data-jsy-corp-grouped] { display: flex; flex-direction: column; overflow: hidden; }
        [data-jsy-corp-grouped] > .jsy-corp-search { margin-bottom: 16px; }
        [data-jsy-corp-grouped] > [data-jsy-corp-group] { display: flex; flex-direction: column; min-height: 0; flex: 0 0 auto; }
        [data-jsy-corp-grouped] > [data-jsy-corp-group="last"] { flex: 1 1 auto; }
        [data-jsy-corp-group] > .corp-desc, [data-jsy-corp-group] > .corp-switch-btn { flex: none; }
        [data-jsy-corp-group] > .corp-wrapper { min-height: 0; flex: 0 1 auto; }
        [data-jsy-corp-group] > .corp-switch-btn { margin-top: auto; }
        [data-jsy-corp-group-empty] > .corp-desc, [data-jsy-corp-group-empty] > .corp-wrapper { display: none !important; }
        [data-jsy-corp-hidden] { display: none !important; }
      `;
      document.documentElement.append(style);
    }
    lists.forEach(list => {
      const state = states.get(list) || attach(list);
      if (state) filter(list, state);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }
  new MutationObserver(schedule).observe(document, { childList: true, characterData: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('corpSearchEnabled' in changes)) return;
    settingChanged = true;
    enabled = changes.corpSearchEnabled.newValue !== false;
    schedule();
  });
  chrome.storage.local.get({ corpSearchEnabled: true }).then(settings => {
    if (settingChanged) return;
    enabled = settings.corpSearchEnabled !== false;
    schedule();
  }).catch(error => console.error('[jsy-tools] 无法读取企业快捷搜索设置', error));
})();
