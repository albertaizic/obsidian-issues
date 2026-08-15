# Code review — obsidian-issues

> **Status: all findings below were addressed in v0.5.0.** Kept as a record of what changed and why.
> Line numbers refer to the pre-v0.5.0 source.

Review of `src/`, `styles.css`, and repo config. Ordered by severity.

---

## Critical

### 1. Frontmatter serialization corrupts issues containing quotes or backslashes
`issue-service.ts:354` — `serializeValue` wraps every string in double quotes with no escaping:

```ts
if (typeof value === 'string') return [`${key}: "${value}"`];
```

A title like `Fix "login" bug` produces `title: "Fix "login" bug"`, which is invalid YAML.
`parseFrontmatter` (line 269) swallows the parse error and returns `{}`, so `readIssue` falls
back to the filename for every field — **priority, labels, project, due and status are silently
lost**. The next `updateIssue` then writes the empty object back to disk, making the loss
permanent.

Same class of problem: labels containing `,` are written as flow-style `[a, b]` in
`linkIssueToNote`, which will split incorrectly on read.

**Fix:** use `app.fileManager.processFrontMatter(file, fm => ...)` — Obsidian's built-in API
handles escaping, preserves unknown keys, and is atomic. That would let you delete
`serializeFrontmatter`, `serializeValue`, `parseFrontmatter`, `extractBody` and
`buildFileContent` entirely.

### 2. `cachedRead` + `modify` can clobber user edits
Every mutation (`updateIssue`, `linkIssueToNote`, `unlinkIssueFromNote`, `updateSourcePath`,
`clearSourceForDeletedNote`) does `cachedRead` → rebuild whole file → `vault.modify`. The cache
can be stale, and the body is rewritten wholesale. If the user has the issue note open in an
editor with unsaved changes, or two events fire concurrently, edits are overwritten. Same fix as
above (`processFrontMatter` only touches the frontmatter block).

### 3. Deleting an issue has no confirmation
`issues-view.ts:612` (list) and `:509` (kanban) — the trash icon calls `deleteIssue` immediately.
In kanban the delete button sits inside a draggable card, so a slightly-off drag start can delete
an issue. It goes to system trash so it's recoverable, but a `ConfirmModal` (or at minimum an
undo Notice) is expected for a destructive action.

---

## Bugs

### 4. Kanban columns stack vertically — the layout container class is never applied
`styles.css:432` defines `.obsidian-issues-kanban { display: flex; overflow-x: auto; }`, but
`renderKanban()` creates the columns directly on `this.contentWrapper`
(`.obsidian-issues-content`), which has no flex rule. The class is dead CSS and the board renders
as three full-width stacked blocks instead of side-by-side columns.

**Fix:** wrap the columns in `contentWrapper.createDiv({ cls: 'obsidian-issues-kanban' })` and
pass that to `renderKanbanColumn`.

### 5. Invalid due dates render as "Invalid date"
The due field is a free-text input with no validation (`issue-modal.ts:149`). `renderIssueRow:638`
and `renderKanbanCard:528` call `parseDueDate(issue.due).format('DD/MM/YYYY')` without checking
`isValid()`, so any typo shows up in the UI as the literal string `Due Invalid date`, and sorts
unpredictably. Either validate on submit or use `<input type="date">`.

### 6. An unrecognised `status` makes an issue invisible in kanban
`readIssue:247` casts the raw frontmatter string to `IssueStatus` with no validation. An issue with
`status: done` (hand-edited, or from another tool) still appears in the list view but matches no
kanban column, so it silently vanishes from the board while still being counted... actually it
isn't counted in the summary either, so the counts won't add up to the total. Validate against
`ISSUE_STATUSES` and fall back to `open`. Same for `priority`.

### 7. Toggling the status dot destroys `in-progress`
`toggleIssueStatus` (`issue-service.ts:192`) is `open ? closed : open`, so clicking the dot on an
in-progress issue moves it to **open**, not closed. The dot also renders `●` for both open and
in-progress (only the colour differs), so the state change is easy to miss. Consider cycling
open → in-progress → closed, or a context menu.

### 8. Double-submit creates duplicate issues
`IssueModal.handleSubmit` awaits `onSubmit` and never disables the submit button. The view
disables its own `+ new issue` button, but that button isn't what the user is clicking. Two fast
clicks on **Create** create two issues.

### 9. Unhandled rejection in "Create issue for current note"
`main.ts:125` — this `onSubmit` has no try/catch, unlike the equivalent in `issues-view.ts:114`.
A failure (e.g. folder permission) produces an unhandled promise rejection and no user feedback.

### 10. Sorting by due date ascending puts undated issues first
`applySort` maps a missing due date to `''`, which sorts before every real date. Issues with no
deadline should sort last regardless of direction.

### 11. Search doesn't match labels
`applyFilters:673` searches title and body only. The README claims "live text search across titles
and labels". Also: no debounce — every keystroke re-renders the whole list.

### 12. Tag-input suggestions never close on blur
`tag-input.ts` hides suggestions on Enter/Escape/selection, but there's no `blur` handler and the
list is `position: fixed`, so clicking elsewhere in the modal leaves an orphaned floating dropdown.

### 13. Drag-then-click opens the file
`renderKanbanCard` has both a `dragstart` and a `click` handler on the card. A drag that ends
inside the source column (or a cancelled drag) fires `click` and opens the note unexpectedly.
Track a `didDrag` flag in `dragstart`/`dragend` and bail out of the click handler.

---

## UI / UX

### 14. Full re-render on every vault event steals focus
Any `modify` in ` Issues/` triggers `refresh()`, which does `contentEl.empty()` and rebuilds the
toolbar. If the user is typing in the search box when an issue file changes, the input is
destroyed and recreated — cursor and focus are lost. Split `refresh()` into "reload data +
re-render content" and only rebuild the toolbar when the project/label sets actually change.

### 15. Two different "Clear all" buttons
The toolbar has **Clear all** (resets every filter) and the Labels dropdown panel has **Clear all**
(resets only labels). Rename the second to "Clear labels".

### 16. Empty kanban board has no drop targets
`renderKanban` returns early with "No issues match your filters" when the filtered set is empty, so
the columns disappear entirely. Always render the three columns with per-column empty states —
that's also the only way to see column structure on a fresh vault.

### 17. Status filter is redundant in kanban mode
The columns *are* the status axis. Filtering by status just empties columns. Hide that dropdown
when `viewMode === 'kanban'`.

### 18. Row action buttons are always visible
`styles.css:162` has `.obsidian-issues-row.is-closed .obsidian-issues-delete-button { opacity: 1 }`,
which implies a hover-reveal design — but there's no base `opacity` rule for the edit/delete
buttons, so they're always at full strength. Every row shows two icon buttons, which is visually
noisy. The kanban card does this correctly (`:518`).

### 19. Accessibility gaps
- The status dot is a `<span>` with a click handler: not focusable, no `role`, no label.
- Filter dropdown options are `<span>`s with click handlers — keyboard users can't select them.
- Kanban cards have no `tabindex`/`role` and no keyboard alternative to drag-and-drop.
- The list row is `role="button"` but contains two nested `<button>`s — invalid ARIA nesting.
  Use a plain container with the title as the clickable element instead.

### 20. Hardcoded colours instead of theme variables
`#ffb400` (`styles.css:172,177`), `hsl(30,100%,50%)` (`:205,262`), `rgba(0,0,0,0.15)` (`:106`),
`rgba(255,255,255,0.3)` (`:333`). These break in light themes — in particular the tag remove
button's white 30% background is invisible on the lighter label colours. Also, the `LABEL_COLORS`
palette is fixed hex, so labels look the same in light and dark mode; the README calls it
"configurable" but there are no plugin settings at all.

### 21. Styles assigned from JavaScript
`el.style.backgroundColor = ...` in `issues-view.ts` (632, 356) and `tag-input.ts` (118, 163).
`eslint-plugin-obsidianmd` flags this, and it's a submission-review blocker for the community
plugin store. Use CSS custom properties instead:
`el.style.setProperty('--label-color', color)` with the rule in `styles.css`.

### 22. `sessionStorage` for view mode
`issues-view.ts:58` — view mode resets whenever Obsidian restarts, and Obsidian's guidelines say to
use `saveData()`/`loadData()` rather than web storage. Move it into plugin data alongside the
(missing) settings.

---

## Performance

### 23. Three full vault scans per modal open
`getAllLabels()` and `getAllProjects()` each call `listIssues()`, which `cachedRead`s every issue
file; `createIssueForCurrentNote` adds `countIssuesForNote()` for a third. Opening the new-issue
modal reads every issue file three times. Cache the issue list on the service and invalidate it on
vault events, or derive labels/projects from the already-loaded `this.issues`.

### 24. `listIssues()` is called on every refresh, which fires on every keystroke-triggered save
Combined with #14 and #11, a large vault will feel sluggish.

---

## Repo hygiene

- **Version mismatch**: `manifest.json` and `package.json` both say `0.2.0`, but the README
  documents milestones through v0.4 and `.claude/plans/` targets v0.5.1. `versions.json` stops at
  `0.2.0`. The release workflow tags from the manifest, so a release right now would be mislabelled.
- **`main.js.full-backup`** (30 KB) is committed at the repo root. `main.js` is gitignored but this
  isn't. Delete it.
- **Dead CSS**: `.obsidian-issues-kanban` (see #4), `.obsidian-issues-label-dropdown-wrapper`,
  `.obsidian-issues-toolbar .obsidian-issues-label-filters`.
- **Dead code**: `issues-view.ts:581` — `issue.status === 'in-progress' ? 'in-progress' : issue.status`
  always evaluates to `issue.status`.
- **`minAppVersion: 1.7.2`** but the code uses `workspace.ensureSideLeaf()`, which is newer than
  1.7.2. Worth verifying against the API you're building against, or bumping the minimum.
- **No settings tab** — the issues folder, label palette and date format are all hardcoded.
- **No tests.** The frontmatter round-trip (parse → mutate → serialize) is exactly the kind of pure
  logic that's cheap to unit-test and where bug #1 would have been caught immediately.

---

## Suggested order

1. #1 + #2 — migrate to `processFrontMatter` (fixes data loss and the clobbering)
2. #4 — kanban layout (most visible breakage)
3. #3, #5, #6, #7, #8 — correctness
4. #21 + #20 — required for community-plugin submission
5. #14, #18, #19 — UX polish
