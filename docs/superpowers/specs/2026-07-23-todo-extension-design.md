# Todo Chrome Extension Design

Date: 2026-07-23
Status: Approved design for implementation planning

## Goal

Build a lightweight Chrome Manifest V3 todo extension in `todo/`. The extension provides a draggable floating entry ball on every ordinary page, a compact todo panel for unfinished work, a local JSON-backed completed history, and a management page with search, editing, settings, and weekly summary visualization.

## Chosen Approach

Use the same lightweight native extension style already used by the `group` and `style` folders:

- Native JavaScript and CSS, no React or build pipeline for the MVP.
- Manifest V3 with a module background service worker.
- A content script injects the floating ball and todo panel into every matched page.
- An options page handles completed history, JSON binding, color presets, and the weekly summary.
- ECharts is loaded as a local static file from `vendor/echarts.min.js`; no remote CDN script is used.

## Scope

### In Scope

- A globally shared unfinished todo list available from any page.
- A floating ball that can stay at any page position and displays the unfinished item count.
- Edge snapping only when the ball is dragged near a viewport edge.
- A panel around `420 x 560` with top input for new todos.
- Drag sorting of unfinished todos, persisted when the panel closes.
- Per-item text editing, long text wrapping, color selection, reminder setting, completion, and deletion.
- Delete and complete controls use `❌` and `✔️` icon-style buttons.
- Unfinished todos, colors, reminders, settings, and ball position are stored in `chrome.storage.local`.
- Completed records are written only when the user clicks `✔️`.
- Local JSON binding supports selecting an existing JSON file and creating a new JSON file.
- Management page supports completed-record text search, text editing, single-record deletion, color preset management, and weekly summary.
- Reminder notifications fire once when Chrome is running and the alarm triggers.

### Out Of Scope For MVP

- Remote file read/write. The storage layer will keep an adapter boundary for future remote support.
- Deduplication or merging of completed records.
- Per-site todo lists.
- Keyboard shortcuts.
- Snooze or repeated reminders.
- Reminder backfill when Chrome was closed, suspended, or missed the alarm.
- Recording source page, color, reminder time, or domain in the completed JSON.
- Exporting weekly summaries as images or extra JSON files.

## Folder Structure

```text
todo/
  manifest.json
  package.json
  README.md
  vendor/
    echarts.min.js
  src/
    background/
      service-worker.js
    content/
      content.css
      content.js
    options/
      options.css
      options.html
      options.js
    shared/
      completed-file-store.js
      data-location.js
      domain.js
      messages.js
      reminder-schedule.js
      settings.js
      storage.js
      weekly-summary.js
```

The split keeps browser API boundaries clear:

- `content/` owns the injected UI and page-local interactions.
- `background/` owns message handling, JSON writes, alarms, and notifications.
- `options/` owns management and settings UI.
- `shared/` owns pure data shaping plus small browser storage adapters.

## Permissions

The manifest should request:

- `storage` for `chrome.storage.local` settings and unfinished todos.
- `notifications` for reminder notifications.
- `alarms` for one-time reminder scheduling.
- `host_permissions: ["<all_urls>"]` and a content script on `"<all_urls>"` so the floating ball appears on ordinary pages.

The File System Access API is used from extension pages to bind a JSON file. File handles are stored in IndexedDB and permissions are checked again when needed.

## Data Model

### Unfinished Todo Storage

Unfinished todos live in `chrome.storage.local`, for example under `todoUnfinishedItems`:

```json
[
  {
    "id": "todo_...",
    "text": "任务名",
    "color": "#fef3c7",
    "reminderAt": "2026-07-23T09:00:00.000Z",
    "reminded": false,
    "createdAt": "2026-07-23T08:30:00.000Z",
    "updatedAt": "2026-07-23T08:35:00.000Z"
  }
]
```

The array order is the list order. Drag sorting mutates the in-memory panel order first and writes the final order to storage when the panel closes.

### Settings Storage

Settings live in `chrome.storage.local`, for example under `todoSettings`:

```json
{
  "ballPosition": {
    "left": 120,
    "top": 240,
    "snapped": false,
    "side": null
  },
  "colorPresets": [
    "#ffffff",
    "#fef3c7",
    "#dcfce7",
    "#dbeafe",
    "#fce7f3",
    "#ede9fe"
  ],
  "defaultColor": "#ffffff"
}
```

Color presets are editable on the management page. Unfinished todos may store the selected color value. Completed records never store color.

### Completed JSON

The local JSON file stores only completed history:

```json
{
  "version": 1,
  "completed": [
    {
      "text": "任务名",
      "completedAt": "2026-07-23T09:30:00.000Z"
    }
  ]
}
```

Each click on `✔️` appends one new record. Records are never deduplicated or merged; the same text completed on different dates remains separate because `completedAt` is the identity-level distinction.

## Floating Ball

- The content script injects one root element if it is not already present.
- The ball displays the current unfinished count in the center.
- Dragging is free-form across the viewport.
- If the ball is released near a viewport edge, it snaps to that edge.
- If it is not near an edge, it stays at the released coordinates.
- The saved position is reused across pages.
- Clicking the ball toggles the panel unless the pointer interaction was a drag.

The ball should avoid taking focus from page content unless clicked or dragged, and all injected styles should be namespaced to avoid leaking into host pages.

## Todo Panel

The opened panel is approximately `420 x 560`.

Top area:

- A single text input for adding a todo.
- Pressing Enter creates the todo in memory and saves it to `chrome.storage.local`.

List area:

- Shows unfinished todos in the stored order.
- Long text wraps naturally.
- Text is editable in place.
- Items are draggable for sorting.
- Each item has actions in this order: color, reminder, `✔️`, `❌`.

Actions:

- Color opens a small palette from current presets and stores the chosen color on the unfinished todo.
- Reminder opens a compact datetime picker plus clear action.
- `✔️` attempts to append `{ text, completedAt }` to the bound JSON file. On success, it removes the unfinished todo and updates the ball count. If no JSON file is bound or permission is missing, it shows a prompt to bind/authorize in the management page and leaves the todo untouched.
- `❌` deletes the unfinished todo immediately with no confirmation.

Closing the panel persists any pending drag-sort order.

## Reminder Behavior

- Each unfinished todo can have one `reminderAt`.
- Reminders are scheduled through `chrome.alarms`.
- When the alarm fires, the background worker loads the current unfinished item.
- If the item still exists, is not completed or deleted, has the matching reminder time, and `reminded` is not true, the extension shows one Chrome notification with the todo text.
- After showing the notification, the item is marked `reminded: true`.
- Clicking the notification performs no action.
- A reminder is considered on time only if the alarm handler runs no more than two minutes after `reminderAt`; this absorbs small scheduler delays without creating late backfill.
- If Chrome was not running, the computer was asleep, or the handler runs more than two minutes early or late, the extension ignores that alarm and leaves the todo eligible for a matching alarm.

When a reminder is edited or cleared, the old alarm is cleared and the new state is saved.

## Local JSON Binding

The management page provides:

- Select existing JSON.
- Create new JSON.
- Show current file name and permission status.
- Request permission again when Chrome requires user activation.

File handles are stored in IndexedDB. The management page and background worker use a shared file-store helper to read and write the completed JSON.

The storage adapter layer should expose a simple completed-history interface:

```js
readCompletedData()
writeCompletedData(data)
appendCompletedRecord(record)
getCompletedFileStatus()
```

For MVP, the only active durable completed-history target is local JSON. A future remote adapter can implement the same interface.

## Management Page

The management page has three primary sections.

### Completed Records

- Reads the bound JSON file.
- Displays completed records sorted by `completedAt` descending.
- Supports text-only search.
- Supports editing a record's text.
- Supports deleting one record.
- Writes changes back to the JSON file.

If no JSON file is bound, this section shows a clear empty/setup state.

### Storage And Settings

- Bind existing JSON.
- Create new JSON.
- Show permission and file status.
- Manage color presets with add, edit, and delete controls.

### Weekly Summary

- Dynamically computes the current week from completed JSON.
- Does not save a weekly report snapshot.
- Uses local ECharts.
- Shows a week time table:
  - Columns default to Monday through Friday.
  - Saturday and Sunday appear only when this week has weekend completed records.
  - Rows include only hours that appear in this week's records.
  - Each cell directly displays all task names completed in that weekday/hour.
  - Cells can grow taller to fit all task names.
  - Cell color intensity may reflect the number of tasks in the cell.

## Data Flow

1. Content script opens and asks the background worker for current unfinished todos and settings.
2. User adds, edits, recolors, deletes, or sets reminders in the panel.
3. The content script sends mutations to the background worker.
4. The background worker normalizes data, persists to `chrome.storage.local`, and updates alarms.
5. On `✔️`, the background worker reads the bound JSON, appends a completed record, writes the JSON, then removes the unfinished todo from local storage.
6. Other pages can refresh state through messages or storage change events so the ball count stays current.
7. The management page reads the same local settings plus completed JSON and writes edits through the shared store helpers.

## Error Handling

- Missing JSON binding: completion is blocked, and the todo remains unfinished.
- Missing file permission: show an authorization prompt in the panel and management page.
- Invalid JSON: show a parse error and avoid overwriting the file automatically.
- File write failure: keep the todo unfinished and show a failure toast.
- Reminder scheduling failure: keep the todo but surface a warning.
- Extension context invalidation after reload: show a short "refresh this page" message.

## Testing And Verification

Use lightweight checks that match the repository style:

- `node --check` for all JavaScript files.
- Unit tests for pure helpers in `src/shared/`:
  - completed JSON normalization
  - todo item normalization
  - reorder logic
  - weekly summary grouping
  - settings sanitization
- Manual Chrome verification:
  - Load unpacked from `todo/`.
  - Confirm the ball appears on ordinary pages and shows count.
  - Drag freely, then verify edge snapping near edges.
  - Add, edit, recolor, sort, delete, and complete todos.
  - Confirm completion writes only `{ text, completedAt }` to JSON.
  - Confirm unbound JSON blocks completion without deleting the todo.
  - Confirm reminders fire once when Chrome is running.
  - Confirm management page search, edit, delete, color preset settings, and weekly summary.

## Open Implementation Notes

- The exact visual polish of the panel and management page can follow the existing extension style but should keep injected UI compact and page-safe.
- The ECharts file must be vendored locally before final verification.
- Remote completed-history support is intentionally represented only as an adapter boundary in MVP.
