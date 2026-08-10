# Obsidian Issues

A GitHub Issues-inspired issue tracker for Obsidian. Issues are stored as normal Markdown files, so your data remains readable and useful even without the plugin.

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
6. Click **+ New Issue**.

You should now have:

```text
ObsidianDev/
├── Issues/
│   └── ISSUE-001.md
└── .obsidian/
    └── plugins/
        └── obsidian-issues/
```

## Production build

```bash
npm run build
```

The build produces `main.js` in the repository root. Obsidian loads the plugin from `main.js`, `manifest.json`, and `styles.css`.

## Screenshots

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
- **v0.3** — filters, search
- **v0.4** — Kanban/dashboard
- **v1.0** — polished release, tests, documentation, demo GIF, GitHub release
