# todo

`todo` is a Chrome Manifest V3 extension with a compact action popup for unfinished todos, completion summaries, and local JSON history.

## Load In Chrome

The repository includes the built `dist/` directory, so a fresh checkout can be loaded directly as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select the `todo` directory.

When changing the React, TypeScript, or shared source files, rebuild the extension and commit the updated `dist/` files together with the source changes:

```bash
pnpm install
pnpm build
```

`dist/` is intentionally tracked because Chrome loads the compiled popup and service worker from that directory. Do not add it back to `.gitignore`.

## Notes

- Click the original todo icon in Chrome's toolbar to open the popup. Chrome positions and dismisses it as a native action popup, so there is no in-page floating ball.
- The popup contains `待办`, `已办`, and `设置` tabs; `已办` contains completion statistics, the weekly completion trend, and completed records.
- In `待办`, click `新增待办` to insert a focused input at the top; press Enter or leave the field to save, and double-click an existing todo to edit it.
- Unfinished todos are stored in `chrome.storage.local`.
- In `设置`, choose a configuration directory. The extension automatically creates or reuses `todo.json` in that directory, then writes completed records there.
- You can also use `导入已有配置文件` to bind an existing JSON file directly.
- The popup, background service worker, and shared modules are written in TypeScript; Vite bundles the popup and service worker into `dist/`.
- The browser does not expose the absolute local path to the extension, so the popup shows the selected directory name and the generated file name.
- Reminder notifications fire once only when Chrome is running and the alarm is handled on time.

## Manual Verification

1. Load unpacked from this folder.
2. Pin the todo extension if needed, then click its original toolbar icon and confirm the native popup opens close to the icon.
3. Add two unfinished todos and confirm the count and list update in the `待办` tab; verify new todos appear at the top and existing todos can be edited by double-clicking.
4. Edit a todo, change its color, set a reminder, drag-sort it, then delete another todo; configure up to 20 task colors in `设置`.
5. Switch to `设置`, choose a configuration directory and confirm `todo.json` is created there without opening a new tab; alternatively import an existing JSON file.
6. Complete a todo and confirm the JSON record contains only `text` and `completedAt`.
7. Confirm the `待办` summary updates and the completed record appears in `已办`.
8. Confirm an unbound or unauthorized JSON file blocks completion without removing the todo.
9. Confirm a due reminder shows one Chrome notification when Chrome is running.
