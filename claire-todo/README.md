# todo

`todo` is a Chrome Manifest V3 extension with a floating global todo list and local JSON completed history.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select `D:\Claire\chrome-plugin\todo`.

## Notes

- Unfinished todos are stored in `chrome.storage.local`.
- The options page can adjust the floating ball theme color and size. The default size is 44px and the supported range is 36-88px.
- Completed records are written to a selected or newly created JSON file only when a todo is completed. Timed todos also store `durationMs`.
- Reminder notifications fire once only when Chrome is running and the alarm is handled on time.
- Workday, weekly, and monthly scheduled tasks are configured from the options page and are added to unfinished todos by Chrome alarms.
- Link todos can be added as `Task title https://example.com`, `[Task title](https://example.com)`, or a plain `https://example.com` URL; linked titles open in a new tab from the panel and completed-record list.

## Manual Verification

### Visual Refresh

- Confirm the 44px default launcher shows the unfinished count in the idle state; timed todos switch it to a white-centered circular progress puck with no corner badge.
- Confirm the panel title, creation band, long-text wrapping, action order, color rail, popovers, and error toast remain readable at narrow and short sizes.
- Confirm the management page uses its desktop work grid, collapses cleanly on a narrow window, and the local ECharts heatmap still fills its summary band.

1. Load unpacked from this folder.
2. Open an ordinary `http` or `https` page and confirm the todo ball appears.
3. Add two unfinished todos and confirm the ball count updates.
4. Drag the ball freely, then drag near an edge and confirm it snaps.
5. Drag-sort todos, close the panel, reopen it, and confirm the order persists.
6. Add `Project Board https://example.com`, confirm it renders as a single-line linked title above the action buttons with the join time below, then edit a plain todo, change its color, set a reminder, and delete another todo.
7. Bind a new completed JSON file from the options page.
8. Start multiple todo timers from their alarm icons, confirm they run together, and use the ball timer control to pause or resume all active timers; the ball should show the earliest active timer with a 30-minute circular progress ring whose theme color deepens as it advances.
9. Confirm an unbound or unauthorized JSON file blocks completion without removing the todo.
10. Confirm a due reminder shows one Chrome notification when Chrome is running.
11. Open the options page and confirm text search, edit, delete, floating ball theme color and size, color presets, scheduled tasks, and weekly summary.
