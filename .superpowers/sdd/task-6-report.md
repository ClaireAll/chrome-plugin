# Task 6 Report: Floating Ball And Todo Panel

## Status

DONE

## Commit

- `617eb7a feat: add todo floating panel`

## Implementation

- Added a single-injection content UI with a floating unfinished-count ball, a fixed `420 x 560` todo panel, scoped toast feedback, and local non-module message constants.
- Added todo creation, editable text persistence on blur/Enter, configured color palettes, datetime-local reminder set/clear controls, immediate delete, and complete handling that preserves the visible item when the background response fails.
- Added local drag sorting that sends `TODO_REORDER_TODOS` operations only when the panel closes.
- Added pointer dragging for the ball with persisted free-form coordinates and a 24 px left/right edge snap threshold.
- Scoped all content CSS below `#todo-extension-root`; no host-page global selectors were added.

## TDD Evidence

1. Added `todo/test/content-panel.test.mjs` and `todo/test/content-css.test.mjs` before the content implementation.
2. Ran `rtk npm test -- test/content-panel.test.mjs test/content-css.test.mjs`; it failed as expected because panel dimensions, unfinished count, and failed-completion behavior were missing.
3. Implemented the content UI and styling, then reran the focused suite successfully.

## Verification

- `rtk npm test -- test/content-panel.test.mjs test/content-css.test.mjs` passed: 3 tests, 0 failures.
- `rtk npm run check` passed.
- `rtk git diff --check` passed before commit.

## Self-review

- Verified action order for each todo is color, reminder, complete, delete.
- Verified complete mutations only update the rendered list after an `ok` response containing `items`; failed responses leave the item visible and surface the background message in the toast.
- Verified options-page and weekly-summary work were not added.

## Concerns

None.

## Re-review Fixes (2026-07-23)

### What I Fixed

- Constrained the panel with viewport-aware CSS dimensions while preserving `420 x 560` on normal viewports.
- Updated panel placement to clamp with the same effective viewport-based dimensions used by CSS.
- Added narrow and short viewport placement coverage, and made the reorder stub apply the requested operation before asserting the rendered order after close.

### Tests Run

- `rtk npm test -- test/content-panel.test.mjs test/content-css.test.mjs`
- `rtk npm run check`

### Exact Result

- Focused suite passed: 8 tests, 0 failures.
- Syntax check passed with exit code 0.

### Files Changed

- `todo/src/content/content.js`
- `todo/src/content/content.css`
- `todo/test/content-panel.test.mjs`
- `todo/test/content-css.test.mjs`
- `.superpowers/sdd/task-6-report.md`

### Self-review

- Confirmed CSS and JavaScript each reserve the same 12 px viewport margin when calculating effective panel dimensions.
- Confirmed the list keeps scrolling internally because the panel retains `overflow: hidden` and the list has `overflow: auto`.
- Confirmed the reorder test returns the stubbed, reordered items and verifies their rendered order after closing.

## Review Fixes (2026-07-23)

### What I Fixed

- Positioned the `420 x 560` panel against the viewport when it opens, selecting space below or above the ball when available and otherwise clamping it inside a 12 px viewport margin.
- Kept click releases separate from drag releases: a pointerup without threshold movement now exits before snapping or persisting the ball position.
- Added regression coverage for viewport placement, click-versus-drag persistence, and persisting a local reorder when the panel closes.

### Tests Run

- `rtk npm test -- test/content-panel.test.mjs test/content-css.test.mjs`
- `rtk npm run check`

### Exact Result

- Focused suite passed: 6 tests, 0 failures.
- Syntax check passed with exit code 0.

### Files Changed

- `todo/src/content/content.js`
- `todo/src/content/content.css`
- `todo/test/content-panel.test.mjs`
- `todo/test/content-css.test.mjs`
- `.superpowers/sdd/task-6-report.md`

### Self-review

- Verified the panel's top coordinate and 560 px height remain within an 800 px viewport with the create input visible.
- Verified an un-moved pointer release neither updates shell coordinates nor sends `TODO_UPDATE_SETTINGS`; a real drag still persists its position.
- Verified closing after a local drag-sort sends `TODO_REORDER_TODOS` with the expected source, target, and placement.

## Re-review Fixes (2026-07-23)

### What I Fixed

- Added a window `resize` listener that repositions an open panel through the existing viewport-aware `positionPanel()` clamp.
- Added regression coverage that opens at desktop dimensions, shrinks both viewport dimensions, and verifies the panel remains inside the 12px margin using effective panel dimensions.

### Tests Run

- `rtk npm test -- test/content-panel.test.mjs test/content-css.test.mjs`
- `rtk npm run check`
- `rtk git diff --check`

### Exact Result

- Focused suite passed: 9 tests, 0 failures.
- Syntax check passed with exit code 0.
- Diff check passed with exit code 0.

### Files Changed

- `todo/src/content/content.js`
- `todo/test/content-panel.test.mjs`
- `.superpowers/sdd/task-6-report.md`

### Self-review

- Confirmed resize handling is scoped to open panels, so closed-panel behavior and existing ball dragging remain unchanged.
- Confirmed the test checks both width and height after one resize event against the same 12px margin/effective dimensions used by production placement.
- Confirmed no CSS change or options-page/weekly-summary work was introduced.
