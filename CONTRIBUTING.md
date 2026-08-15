# Contributing to Vault Issues

Thanks for taking the time to help. Bug reports, feature requests and pull
requests are all welcome.

## Development setup

Use a **separate development vault**, not one holding notes you care about —
you will be creating, moving and deleting issue files while testing.

The plugin folder name must match the plugin ID, `vault-issues`:

```bash
cd /path/to/ObsidianDev/.obsidian/plugins
git clone https://github.com/albertaizic/obsidian-issues.git vault-issues
cd vault-issues
npm ci
npm run dev
```

Then, in Obsidian:

1. Open the development vault.
2. Go to **Settings → Community plugins** and turn off Restricted mode.
3. Enable **Vault Issues**.
4. Run **Open issues** from the Command Palette.

`npm run dev` rebuilds `main.js` on every save, but **Obsidian only ever runs
`main.js`** — you still have to reload the plugin for it to pick up the new
build. Disable and re-enable it, or run **Reload app without saving**.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Install dependencies exactly as locked |
| `npm run dev` | Watch `src/` and rebuild `main.js` on change |
| `npm run lint` | ESLint, including `eslint-plugin-obsidianmd` |
| `npm test` | Unit tests via Node's built-in test runner |
| `npm run build` | Type-check and produce a minified `main.js` |

Run all four of `npm ci`, `npm run lint`, `npm test` and `npm run build` before
opening a pull request. CI runs them on Node 20, 22 and 24.

## Project conventions

- **Never commit `main.js`.** It is a build artifact and is gitignored.
- **No styles from JavaScript.** No `element.style`, no `setProperty`, no
  inline `style=`. Anything visual belongs in `styles.css`; code only picks
  class names. There is a test that enforces this.
- **Keep pure logic out of Obsidian-dependent code.** Filtering, sorting, ID
  handling, settings normalisation and migration planning are all pure and
  unit-tested. New logic should follow that pattern so it can be tested without
  a running app.
- **Sentence case for UI text**, per Obsidian's style guide.
- **Command IDs are stable API.** Rename the visible name if you must, never
  the ID.
- **Preserve data compatibility.** Existing issue files, settings and the
  legacy-folder migrations must keep working.
- The plugin is **desktop-only** and makes **no network requests**. Please don't
  add either.

## Reporting bugs

Open a [bug report](https://github.com/albertaizic/obsidian-issues/issues/new?template=bug_report.yml)
and include:

- your Vault Issues version and Obsidian version
- your operating system
- exact steps to reproduce
- what you expected, and what actually happened
- any errors from the developer console (**Ctrl/Cmd + Shift + I**)

If the bug involves an issue file, a copy of its frontmatter helps a lot.
Please redact anything private first.

## Requesting features

Open a [feature request](https://github.com/albertaizic/obsidian-issues/issues/new?template=feature_request.yml)
describing the problem you are trying to solve rather than a specific
implementation. Vault Issues is intentionally small and local-first — mobile
support, cloud or GitHub synchronisation, and AI features are out of scope.

## Pull requests

1. Fork and branch from `main`.
2. Keep the change focused; one concern per pull request.
3. Add or update tests for anything testable.
4. Make sure `npm run lint`, `npm test` and `npm run build` all pass.
5. Add a `CHANGELOG.md` entry under **Unreleased**.
6. Write a plain description of what changed and why, and mention any manual
   testing you did in Obsidian.

Commit messages are conventional and technical — `fix: …`, `refactor: …`,
`test: …`, `docs: …` — and describe the change, not the reasoning. The
reasoning belongs in the code comments, the pull request, or the changelog.

## License

By contributing you agree that your contributions are licensed under the
[0BSD license](LICENSE) that covers this project.
