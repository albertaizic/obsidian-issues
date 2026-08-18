# Changelog

All notable changes to Vault Issues are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release tags do not carry a leading `v` — the tag for 1.0.0 is `1.0.0`.

## [1.0.0] — First stable release

### Changed

- **README and documentation** rewritten for a third-party audience — clearer screenshots, polished prose, and a new "disabled when viewing an issue" note for the "Create issue for current note" command.
- **Reset filters button** now uses the accent colour when any filters are active, matching the filter dropdowns.
- **CONTRIBUTING.md** polished for external contributors.
- **Lint fixes** — settings tab now implements `getSettingDefinitions()` for Obsidian 1.13+ settings search; description text uses sentence case.
- **Version bumped to 1.0.0** — feature-complete, beta period concluded.

### Fixed

- The "Create issue for current note" command is now disabled when the active file is already an issue file, preventing accidental circular references.
- Toolbar now re-renders when filters change, so the Reset filters button updates its visual state immediately.

## [0.9.0] — Release candidate

Feature freeze. This release makes the existing 0.8 functionality ready for
public beta testing and Obsidian Community Plugins submission. No new
user-facing features; no change to issue formats, settings or migrations.

### Changed

- **Label colours are now CSS classes.** A label's colour was previously
  applied by writing CSS custom properties onto `element.style` at runtime.
  The hash that maps a label name to a palette slot is unchanged, so every
  label keeps the colour it already had, but the element now receives an
  `.vault-issues-label-color-0` … `.vault-issues-label-color-9` class and the ten colour pairs are
  declared in `styles.css`. Themes and snippets can override them.
- **The label suggestion list is positioned by CSS.** It was a
  `position: fixed` element whose coordinates were measured and written from
  JavaScript on every render, scroll and resize. It is now absolutely
  positioned inside the tag-input wrapper, which drops the scroll and resize
  listeners entirely. Keyboard navigation, focus handling, outside-click
  dismissal and scrolling are unchanged.
- **UI text follows Obsidian's sentence-case convention.** The `+ New issue`
  button is now `+ new issue`, and the **Toggle list / Kanban layout** command
  is now **Toggle list / kanban layout**. Command IDs are unchanged.
- The new/edit form no longer clips its own content. The `overflow-x: hidden`
  rules on the form and modal content area were replaced with `min-width: 0`
  on the flex items, which is what actually prevents long values from
  overflowing — and does not turn the form into a scroll container.

### Added

- `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, and GitHub issue forms for
  bug reports and feature requests.
- Tests for the label palette: hash determinism, palette bounds, a regression
  pin on the pre-0.9.0 slot assignments, and a guard that fails the build if
  any runtime style assignment is reintroduced into `src/`.

### Documentation

- The README is now a user/product README. Version-by-version history moved
  here.
- The documented development plugin path is corrected to
  `.obsidian/plugins/vault-issues/`, matching the plugin ID.

### Release process

- The release workflow now runs `npm ci`, `npm run lint`, `npm test` and
  `npm run build` before a release can be created, and fails if the pushed tag
  does not exactly match the version in both `manifest.json` and
  `package.json`. Releases are still created as drafts.

## [0.8.0] — Desktop UX & cleanup

### Added

- Desktop context menus for issue actions: right-click any list row or Kanban
  card for Open, Edit, status changes, the linked source note, and Delete.
- Quick status changes from list and Kanban views. Status entries are phrased
  as actions ("Mark as in progress"); the current status is checked and
  disabled.
- Direct access to linked source notes from issue menus, shown only when the
  note exists.
- Project information on Kanban cards.
- Clearer feedback when search or filters are active: a `Showing 6 of 37` line,
  and **Reset filters** only becomes prominent once something is active.

### Changed

- **Vault Issues is now explicitly desktop-only** (`isDesktopOnly: true`).
- View rendering refactored into smaller modules: `views/` holds the
  coordinator, list and Kanban renderers; `components/` holds the toolbar,
  actions/context menu and metadata rendering. `issues-view.ts` went from
  ~1,193 lines to ~412.
- The Obsidian Issues → Vault Issues rename completed across the README, the
  plugin class and all console output. CSS namespaces remain
  `obsidian-issues-*` deliberately.
- Expanded automated coverage for migration and issue-management behaviour.

### Fixed

- The status toggle rendered as an ellipse rather than a circle: as a flex item
  it inherited padding and a min-width from Obsidian's base button styles. The
  aspect ratio is now pinned explicitly.
- `buildFilenamePattern` was defined twice and the copies had drifted — only
  one escaped the prefix before building the regex. Consolidated into
  `utils/issue-id.ts`.
- The settings footer reserved far too much space; a `position: sticky` element
  keeps its place in normal flow, so the compensating padding was unnecessary.

## [0.7.1] — Settings apply/cancel

### Added

- **Apply changes / Cancel.** The settings tab no longer writes as you type.
  Edits are staged as a draft and committed together, with a status line
  reporting what Apply will do before you press it.
- Renaming the issues folder migrates existing issues into it, and removes the
  old folder only if nothing else is left in it.
- Changing the ID prefix renames existing issues (`ISSUE-001.md` →
  `TASK-001.md`), rewrites the `id` field, and repoints the `issues` list in
  any linked source note. Previously a prefix change orphaned the whole
  backlog.
- Dot-prefixed folder names are blocked with an inline explanation rather than
  silently corrected, and Apply stays disabled until the field is fixed.
- The issues view is fully reset after Apply, so no filter or search state
  survives from the previous folder.

### Fixed

- **The default folder `" Issues"` lost its leading space.** `trim()` was
  applied to the folder name, so the default silently became `"Issues"` as soon
  as the settings tab was touched — pointing the plugin at a folder containing
  none of the existing issues. Only trailing whitespace is stripped now.

## [0.7.0] — Reliability & architecture

### Added

- Automated tests in GitHub Actions, running on Node.js 20, 22 and 24.

### Changed

- The monolithic `issues-view.ts` split into dedicated modules for filtering,
  sorting, ID utilities and settings configuration.
- Improved separation between UI, filtering, persistence and issue-management
  logic, so pure logic is independently testable.
- Expanded the automated test suite to cover issue IDs, statuses, sorting,
  filtering, settings normalisation and frontmatter parsing.
- Malformed or incomplete Markdown issue files degrade gracefully: invalid
  frontmatter values fall back to safe defaults, and impossible dates and
  unknown statuses are handled rather than breaking the view.

## [0.6.0] — Configurability & migration

### Added

- **Configurable issues folder.** The default remains `" Issues"` (leading
  space, so it sorts to the top). Dot-prefixed names are rejected because
  Obsidian's Vault API silently ignores them.
- **Configurable issue ID prefix** — `ISSUE`, `TASK`, `BUG`, … normalised to
  uppercase alphanumerics and underscores.
- **Default priority setting** for new issues.
- **Persistent default layout and sort order**, surviving restarts instead of
  resetting each session.
- **Automatic migration from legacy folder locations** (`.Issues`, `Issues`,
  and the v0.5 default `" Issues"`) into the configured folder. Duplicates at
  the destination are skipped and the source removed, leaving no orphans.

### Changed

- Core logic refactored into testable modules (`config/settings.ts`,
  `filters/issue-filter.ts`, `filters/issue-sort.ts`, `utils/issue-id.ts`) with
  a unit-test suite covering them.

## [0.5.0] — Kanban & knowledge-base integration

### Added

- Single-column Kanban with status group separation, and drag-and-drop cards
  that rewrite frontmatter on drop.
- Create an issue from the currently open note; link issues to source notes and
  navigate between them in both directions.
- Command Palette entries: Open issues, Create issue, Create issue for current
  note, Toggle list / Kanban layout.
- Settings tab: default layout, default sort order, delete confirmation.

### Fixed

- **Frontmatter is written through Obsidian's `processFrontMatter` API.** The
  previous serializer quoted values without escaping them, so an issue whose
  title contained a `"` produced invalid YAML and silently lost all metadata.
  Existing issues are read and repaired automatically.
- Writes no longer rewrite the whole file, so they cannot overwrite unsaved
  changes in an open editor.
- Deleting an issue asks for confirmation (can be turned off in settings).
- Due dates use a native date picker and are validated; unreadable values are
  flagged instead of rendering as `Invalid date`. Urgency colouring is retired
  once an issue is closed.
- Unrecognised `status` values fall back to `open` rather than making the issue
  vanish from the board.
- The status dot cycles open → in progress → closed instead of discarding the
  in-progress state.
- Search covers titles, bodies, labels, projects and issue IDs, and is
  debounced.
- Undated issues sort last regardless of sort direction.
- Vault changes no longer rebuild the toolbar, so the search box keeps focus
  while you type.
- Full keyboard support for filter options, status toggles and Kanban cards,
  including `Ctrl`/`Cmd` + `←`/`→` to cycle a focused issue's status.
- All colours come from Obsidian theme variables, so the plugin follows light
  and dark themes.

## [0.4.0] — Kanban

### Added

- List / Kanban view switching, with Open, In Progress and Closed columns.
- Drag-and-drop issue cards; moving a card updates Markdown frontmatter.
- Status synchronisation between Kanban and list views.
- Basic dashboard statistics.

## [0.3.0] — Search, filters & sorting

### Added

- Live text search, open/closed/all filters, and project, priority, label and
  due-date filtering.
- Sort by priority, creation date or due date, ascending or descending.
- Overdue indicators, live open/closed counters, and colour-coded label pills.

### Changed

- Date display format changed to day/month/year (e.g. `10/08/2026`).

## [0.2.0] — Issue metadata & editing

### Added

- Close/reopen toggle on the status dot.
- New issue modal, and an edit modal with all fields editable.
- Priority, project, labels and due-date fields.

### Changed

- v0.1 issues display and edit without errors; missing fields fall back to
  defaults.

## [0.1.0] — Starter

### Added

- `Open issues` command and a right-sidebar issues view.
- Automatic issues folder creation and sequential `ISSUE-001.md` files.
- Reading `title` and `status` from YAML frontmatter.
- Opening an issue note from the sidebar, and live refresh when issue files
  change.

[Unreleased]: https://github.com/albertaizic/obsidian-issues/compare/0.9.0...HEAD
[0.9.0]: https://github.com/albertaizic/obsidian-issues/compare/0.8.0...0.9.0
[0.8.0]: https://github.com/albertaizic/obsidian-issues/compare/0.7.1...0.8.0
[0.7.1]: https://github.com/albertaizic/obsidian-issues/compare/0.7.0...0.7.1
[0.7.0]: https://github.com/albertaizic/obsidian-issues/compare/0.6.0...0.7.0
[0.6.0]: https://github.com/albertaizic/obsidian-issues/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/albertaizic/obsidian-issues/compare/0.4.0...0.5.0
[0.4.0]: https://github.com/albertaizic/obsidian-issues/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/albertaizic/obsidian-issues/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/albertaizic/obsidian-issues/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/albertaizic/obsidian-issues/releases/tag/0.1.0
