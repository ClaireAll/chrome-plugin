# Todo Visual Refresh Design

Date: 2026-07-24
Status: Approved visual direction, awaiting implementation-plan review

## Goal

Refresh the Todo Chrome extension so the floating launcher is recognizable at a
glance and the panel and management page share one coherent, work-focused
visual system. Preserve every existing behavior, storage contract, and
interaction order.

## Confirmed Direction

The visual target combines the selected generated directions:

- Launcher: use the third direction's instrument-dial treatment.
- Todo panel and management page: use the first direction's calm workspace
  treatment.

The combination deliberately gives the small, persistent launcher a stronger
identity while keeping the larger work surfaces quiet and easy to scan.

## Scope

### In Scope

- Restyle the floating launcher, todo panel, panel controls, and error toast.
- Restyle the options-page shell, section hierarchy, completed-record rows,
  color-preset controls, and weekly-summary container.
- Add only the presentational markup needed for a panel heading and the
  launcher detail. Existing todo actions, their order, and their event
  handlers remain unchanged.
- Preserve responsive panel clamping, drag positioning, edge snapping,
  long-text wrapping, and all current accessible labels.
- Add focused DOM and CSS contract tests for the added visual structure and
  launcher count rendering.

### Out Of Scope

- No data-model, storage, JSON file, reminder, notification, or completion
  flow changes.
- No new routes, shortcuts, filtering modes, categories, or task metadata.
- No remote assets, runtime web fonts, runtime CDN resources, or image assets.
- No change to the selected completion and deletion labels: `✔️` and `❌`.

## Visual System

### Color Roles

Use a restrained multi-hue operational palette rather than a single-hue theme:

| Role | Color | Use |
| --- | --- | --- |
| Ink | `#18212F` | Primary text and launcher number |
| Canvas | `#F6F8FB` | Options-page background |
| Surface | `#FFFFFF` | Panel, inputs, grouped data surfaces |
| Cobalt | `#2563EB` | Primary action, launcher ring, keyboard focus |
| Teal | `#0F9F8F` | Positive state and completed markers |
| Coral | `#E35D5B` | Destructive state and launcher status tick |
| Slate | `#667085` | Supporting text and inactive controls |
| Divider | `#DDE3EC` | Row and section separation |

Item colors remain user-configurable and keep their existing stored values.
They are not remapped or written into completed JSON data.

### Typography And Geometry

- Use the existing system-font stack for the options page and a compatible
  system sans-serif for injected content.
- Keep body text at 14px or larger and use 12px only for secondary metadata.
- Use an 8px maximum radius for panels, rows, inputs, and action controls.
- Prefer spacing and one-pixel dividers over nested cards or broad shadows.
- Use a single soft elevation for the floating panel and launcher only.

## Floating Launcher

The launcher remains a 48px circular button so its drag target and existing
position persistence stay intact. Its appearance changes from a solid teal
circle to a compact instrument dial:

- White center with a bold ink unfinished count.
- Cobalt outer ring as the primary contour.
- One short teal progress tick and one short coral status tick on the ring.
- A small, non-interactive dotted drag cue appears beside the button only on
  hover or keyboard focus, without changing pointer handling.
- The count stays centered and retains an accessible label that includes the
  unfinished-task total.
- Hover and focus increase ring contrast and elevation; active state remains
  visually stable so it is not mistaken for a new completion state.

The launcher must not use a gradient, glossy treatment, or decorative
animation. It remains visibly functional, compact, and readable at any page
edge.

## Todo Panel

The existing 420px by 560px responsive panel remains the same size contract.
It becomes a calm workspace surface:

- Add a slim header with a concise Chinese title and the current unfinished
  count. It is presentation-only and does not add a new workflow.
- Place the add input in a clearly separated creation band with a cobalt focus
  treatment and an inline submit affordance that still submits on Enter.
- Keep unfinished todos on one grouped list surface. Separate rows with thin
  dividers rather than treating every item as a floating card.
- Give each row a 4px user-selected color rail, readable editable text, and a
  fixed-width action cluster in the existing order: color, reminder, `✔️`,
  `❌`.
- Make color and reminder popovers visually attached to their owning row using
  a quiet tinted surface and a compact border.
- Keep long text wrapping in the text column and prevent action controls from
  shrinking or shifting.
- Restyle the error toast as an accessible coral alert with a stable maximum
  width and the existing viewport clamp behavior.

## Management Page

The options page becomes a full-width operational workspace with an editorial
data hierarchy:

- Use a narrow utility header for the title and a muted supporting sentence.
- Use a two-column desktop layout: completed-history work remains primary;
  storage and color settings occupy a compact supporting rail. Collapse to a
  single readable column on small screens.
- Treat completed records as a single grouped data surface with row dividers,
  not a stack of independent cards.
- Keep search attached to the completed-history heading and keep record
  actions compact and aligned at the row edge.
- Give storage status a distinct, readable state treatment without changing
  picker, creation, or permission behavior.
- Present color presets as measured square swatches with an explicit selected
  and focus state.
- Give the weekly ECharts heatmap a dedicated, full-width summary band with a
  clear heading and enough surrounding whitespace for task labels.

## Behavior And Accessibility

- Existing content-script CSS remains fully scoped under `#todo-extension-root`.
- No action semantics, Chrome message types, browser permissions, or storage
  keys change.
- Existing title and aria-label coverage remains in place; new heading and
  count details use readable Chinese labels.
- Focus rings use cobalt with sufficient contrast on white surfaces.
- Hover-only decoration is never required to discover or execute an action.
- The panel must remain usable at the existing narrow and short viewport test
  sizes.

## Files Expected To Change

- `todo/src/content/content.js`
- `todo/src/content/content.css`
- `todo/src/options/options.html`
- `todo/src/options/options.css`
- Focused content-panel and options UI tests when their DOM expectations need
  to cover the added structure.

No shared data, background-worker, manifest, vendor, or file-store module is
expected to change.

## Verification

Run the existing automated suite and syntax check after implementation:

```text
npm test
npm run check
```

Manually load the unpacked extension in Chrome and verify:

1. The launcher count, click behavior, drag movement, edge snapping, and
   restored position are unchanged.
2. The panel fits ordinary, narrow, and short viewports and text never overlaps
   the fixed action cluster.
3. Color, reminder, completion, deletion, and drag sorting work exactly as
   before.
4. The options page works at desktop and narrow widths, and the weekly chart
   still renders from the local ECharts bundle.
