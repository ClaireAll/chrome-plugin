# todo

`todo` is a Chrome Manifest V3 extension with a floating global todo list and local JSON completed history.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select `D:\Claire\chrome-plugin\todo`.

## Notes

- Unfinished todos are stored in `chrome.storage.local`.
- Completed records are written to a selected or newly created JSON file only when a todo is completed.
- Reminder notifications fire once only when Chrome is running and the alarm is handled on time.

## Manual Verification

### Visual Refresh

- Confirm the 48px launcher shows the unfinished count with a cobalt ring plus teal and coral ticks, while drag and edge-snap behavior remains unchanged.
- Confirm the panel title, creation band, long-text wrapping, action order, color rail, popovers, and error toast remain readable at narrow and short sizes.
- Confirm the management page uses its desktop work grid, collapses cleanly on a narrow window, and the local ECharts heatmap still fills its summary band.

1. Load unpacked from this folder.
2. Open an ordinary `http` or `https` page and confirm the todo ball appears.
3. Add two unfinished todos and confirm the ball count updates.
4. Drag the ball freely, then drag near an edge and confirm it snaps.
5. Drag-sort todos, close the panel, reopen it, and confirm the order persists.
6. Edit a todo, change its color, set a reminder, then delete another todo.
7. Bind a new completed JSON file from the options page.
8. Complete a todo and confirm the JSON record contains only `text` and `completedAt`.
9. Confirm an unbound or unauthorized JSON file blocks completion without removing the todo.
10. Confirm a due reminder shows one Chrome notification when Chrome is running.
11. Open the options page and confirm text search, edit, delete, color presets, and weekly summary.
