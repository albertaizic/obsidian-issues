# Obsidian Issues

A GitHub Issues-inspired issue tracker for Obsidian. Issues are stored as normal Markdown files, so your data remains readable and useful even without the plugin.

## Why

This plugin exists because Obsidian has no built-in task tracker with the workflow affordances of GitHub Issues — status cycling, labels, priorities, due dates, drag-and-drop Kanban, and bidirectional linking to your notes. It was built as a hackable, self-contained alternative to external tools so the workflow stays inside your vault. The codebase is intentionally kept dependency-free and easy to modify: issue data is plain YAML frontmatter in Markdown files, so you can fix, extend, or inspect issues with nothing more than a text editor.

It also serves as a vehicle for working through a larger TypeScript/Obsidian plugin project end-to-end — from initial scaffolding to filtering, search, Kanban, and a settings UI.

## Project structure

```
src/
  main.ts            Plugin entry point, lifecycle, commands, vault event wiring
  issue-service.ts   Reads, writes, caches, and migrates issue files
  issues-view.ts     The sidebar view: list and Kanban rendering
  issue-modal.ts     New/edit issue form with tag-input labels
  tag-input.ts       Reusable tag-input component for labels
  labels.ts          Label colour assignment
  dates.ts           Date parsing, formatting, and comparison helpers
  constants.ts       Status/priority enums, field order, folder name
  types.ts           Issue, IssueData, IssueStatus, IssuePriority types
  settings.ts        Settings interface, defaults, settings tab
  confirm-modal.ts   Reusable confirmation dialog
```

`styles.css` is loaded by Obsidian alongside `main.js` and `manifest.json`. Source in `src/ts` is bundled with esbuild into `main.js` at the plugin root.

## Milestone: v0.1 — starter

This first milestone supports:

- `Open issues` command
- right-sidebar Issues view
- `+ New Issue` button
- automatic `Issues/` folder creation
- sequential files such as `ISSUE-001.md`, `ISSUE-002.md`, ...
- reading issue `title` and `status` from YAML frontmatter
- opening an issue note by clicking it in the sidebar
- live sidebar refresh when issue files change

Example issue:

```md
---
id: ISSUE-001
title: New issue
status: open
created: 2026-08-10
---

Describe the issue here.
```

## Milestone: v0.2 — issue metadata + editing

Adds richer issue metadata and in-place editing:

- **Close/reopen toggle** — click the status dot (●/○) to toggle open and closed
- **New issue modal** — `+ new issue` opens a form with title (status not editable)
- **Priority field** — `low` / `medium` / `high` / `critical` dropdown with color-coded badges
- **Project field** — free-text project name
- **Labels field** — comma-separated tags displayed as pills in the sidebar
- **Due date** — date picker shown in the row metadata
- **Edit issue modal** — pencil icon per row opens the same form with all fields editable (including status)

Updated issue format with all v0.2 fields:

```md
---
id: ISSUE-005
title: Implement API client
status: open
priority: high
project: Auth Service
labels:
  - backend
  - security
due: 2026-08-20
created: 2026-08-10
---

Describe the issue here.
```

Old v0.1 issues display and edit without errors — missing fields fall back to their defaults.

## Milestone: v0.3 — search, filters & sorting

Adds tools for managing larger collections of issues through search, filtering and sorting.

- **Issue search** — live text search across titles and labels
- **Open / Closed / All filters** — toggle the visible issue set
- **Project filtering** — project dropdown selection
- **Priority filtering** — filter by one or more priority levels
- **Label filtering** — filter by selected labels
- **Due-date filtering** — filter by overdue, due this week, etc.
- **Sort by** — priority, creation date, and due date (ascending or descending)
- **Overdue indicators** — issues past their due date are flagged
- **Open and closed issue counters** — live counts in the sidebar header
- **Delete issue button** — remove an issue from the edit modal
- **GitHub-style label tags** — color-coded label pills with a configurable palette

Date format updated to day/month/year (e.g. `10/08/2026`).

![Issues sidebar with search and filters](screenshots/v0.3-issue-sidebar.png)

## Milestone: v0.4.0 — Kanban

Introduces a visual Kanban board alongside the existing list view.

- **List / Kanban view switching**
- **Open, In Progress and Closed columns**
- **Drag-and-drop issue cards**
- **Moving a card automatically updates Markdown frontmatter**
- **Status synchronization between Kanban and list views**
- **Basic dashboard statistics**
- **Improved search filtering**

![Issues Kanban view](screenshots/v0.4-issues-kaban-view.png)
![Full view](screenshots/v0.4-full-view.png)

## Milestone: v0.5.0 — Kanban and knowledge-base integration

Adds deep integration with the user's Obsidian knowledge base, allowing tasks and project work to
reference the notes they originated from.

Features:

- **List / Kanban view switching**
- **Single-column Kanban with status group separation**
- **Drag-and-drop issue cards**
- **Moving a card automatically updates Markdown frontmatter**
- **Status synchronization between Kanban and list views**
- **Basic dashboard statistics**
- **Create issue from the currently open note**
- **Link issues to source notes**
- **Navigate from an issue to its related note**
- **Project relationships**
- **Commands for creating and managing issues from anywhere in Obsidian**
- **Improved integration with Obsidian's workspace**

Commands added to the Command Palette:

| Command | What it does |
| --- | --- |
| `Open issues` | Reveals the issues view in the right sidebar |
| `Create issue` | Opens the new-issue form from anywhere |
| `Create issue for current note` | Creates an issue linked to the active note |
| `Toggle list / Kanban layout` | Switches the issues view between layouts |

An issue created from a note records the note in its `source` field, and the note records the
issue in its own `issues` list — so the link is navigable in both directions:

```md
---
id: ISSUE-007
title: Rewrite the onboarding section #1
status: in-progress
priority: high
project: Handbook
source: Notes/Handbook.md
labels:
  - docs
due: 20/08/2026
created: 2026-08-13
---
```

![Issues sidebar with single-column Kanban](screenshots/v0.5-issues-sidebar.png)
![Single-column Kanban view](screenshots/v0.5-issues-kanban-view.png)
![Edit issue modal](screenshots/v0.5-edit-issue.png)

### Reliability and interface work in this release

- Frontmatter is now written through Obsidian's own `processFrontMatter` API. The previous
  serializer quoted values without escaping them, so an issue whose title contained a `"` produced
  invalid YAML and silently lost its metadata. Existing issues are read and repaired automatically.
- Writes no longer rewrite the whole file, so they can't overwrite unsaved changes in an open editor.
- Deleting an issue asks for confirmation (can be turned off in settings).
- Due dates use a native date picker and are validated; unreadable values are flagged in the list
  instead of rendering as `Invalid date`.
- Due dates are colour-coded by urgency: **red** once overdue, **amber** on the day they are due,
  muted otherwise. Closing an issue retires the colour — a closed issue is never shown as overdue,
  since its deadline is history.
- Unrecognised `status` values fall back to `open` rather than making the issue vanish from the board.
- The status dot cycles open → in progress → closed instead of discarding the in-progress state.
- Search covers titles, bodies, labels, projects and issue IDs, and is debounced.
- Undated issues sort last regardless of sort direction.
- Vault changes no longer rebuild the toolbar, so the search box keeps focus while you type.
- Full keyboard support: filter options, status toggles and Kanban cards are all reachable, and
  `Ctrl`/`Cmd` + `←`/`→` cycles a focused issue's status (open → in progress → closed).
- All colours now come from Obsidian theme variables, so the plugin follows light and dark themes.
- New settings tab: default layout, default sort order, and delete confirmation.

## Development setup

Use a separate development vault. A convenient layout is:

```text
ObsidianDev/
└── .obsidian/
    └── plugins/
        └── obsidian-issues/
```

Clone this repository into the plugin folder, then run:

```bash
npm install
npm run dev
```

In Obsidian:

1. Open the `ObsidianDev` vault.
2. Go to **Settings → Community plugins**.
3. Turn off Restricted mode if necessary.
4. Enable **Obsidian Issues**.
5. Open the Command Palette and run **Open issues**.
6. Click **+ New issue**.

You should now have:

```text
ObsidianDev/
├──  Issues/
│   └── ISSUE-001.md
└── .obsidian/
    └── plugins/
        └── obsidian-issues/
```

The issues folder is named `" Issues"` with a leading space so it sorts to the top of the file
list. Vaults created with v0.1–v0.3 used `Issues/` or `.Issues/`; both are migrated automatically
on first load.

## Tests

```bash
npm test
```

Runs the date-handling unit tests with Node's built-in test runner (requires Node 22+).

## Production build

```bash
npm run build
```

The build produces `main.js` in the repository root. Obsidian loads the plugin from `main.js`, `manifest.json`, and `styles.css`.

**Editing the source is not enough — Obsidian only ever runs `main.js`.** After changing anything in
`src/` or `styles.css`, rebuild and then reload the plugin (disable and re-enable it under
**Settings → Community plugins**, or run **Reload app without saving**). `npm run dev` watches and
rebuilds automatically, but the reload is still needed for Obsidian to pick up the new file.

If esbuild refuses to run — for example its installed binary doesn't match the current platform,
which happens when `node_modules` was installed on a different OS — there is a fallback bundler
that uses `tsc` instead:

```bash
npm run build:fallback
```

It produces a larger, unminified `main.js` with identical behaviour. `npm run build` remains the
supported path.

## Screenshots

### v0.5.0

![Issues sidebar](screenshots/v0.5-issues-sidebar.png)
![Single-column Kanban view](screenshots/v0.5-issues-kanban-view.png)
![Edit issue modal](screenshots/v0.5-edit-issue.png)

### v0.4.0

![Issues Kanban view](screenshots/v0.4-issues-kaban-view.png)
![Full view](screenshots/v0.4-full-view.png)

### v0.3

![Issues sidebar with search and filters](screenshots/v0.3-issue-sidebar.png)
![Edit issue modal](screenshots/v0.3-edit-issue.png)

### v0.2

![Issues sidebar with metadata](screenshots/v0.2-issues-sidebar.png)
![Edit issue modal](screenshots/v0.2-edit-issue.png)

### v0.1

![Issues sidebar](screenshots/v0.1-issues-tab.png)
![Sidebar with issue open](screenshots/v0.1-view-issue-open.png)
![Full view](screenshots/v0.1-full-view.png)
![Full view with issue open](screenshots/v0.1-full-view-issue-open.png)

## Roadmap

- **v0.1** ~ completed — create/read/close issues
- **v0.2** ~completed — labels, priority, projects, due dates, edit modal
- **v0.3** ~completed — filters, search
- **v0.4** ~completed — Kanban/dashboard
- **v0.5** ~completed — Kanban and knowledge-base integration
- **v0.5** ~completed — note integration, commands, settings, accessibility and reliability pass
- **v1.0** — polished release, expanded test coverage, documentation, demo GIF, GitHub release
