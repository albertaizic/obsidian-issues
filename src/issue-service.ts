import { App, normalizePath, parseYaml, TFile } from 'obsidian';
import {
  DEFAULT_ISSUE_BODY,
  FRONTMATTER_FIELD_ORDER,
  ISSUES_FOLDER_HIDDEN_LEGACY,
  ISSUES_FOLDER_VISIBLE_LEGACY,
  ISSUES_FRONTMATTER_KEY,
  nextStatus,
  normalizePriority,
  normalizeStatus,
} from './constants.ts';
import { getNextIssueId, issueFilesInFolder } from './utils/issue-id.ts';
import { toDisplayDate, toIsoDate } from './dates.ts';
import {
  planFolderMove,
  planPrefixRename,
  type PlannableFile,
} from './utils/migration.ts';
import type { Issue, IssueData, IssueStatus } from './types.ts';
import type { IssuesSettings } from './settings.ts';

type Frontmatter = Record<string, unknown>;

export class IssueService {
  /**
   * Issues are read from disk on demand and cached until a vault event
   * invalidates them. Without this, opening the new-issue modal read every
   * issue file three times (labels, projects and the per-note count each
   * triggered a full scan).
   */
  private cache: Issue[] | null = null;
  private inFlight: Promise<Issue[]> | null = null;
  /**
   * Bumped by every invalidation. A read that finishes after the data it was
   * based on was invalidated must not install itself as the new cache —
   * otherwise a vault event arriving mid-read leaves stale issues cached
   * until the next write.
   */
  private generation = 0;

  constructor(
    private readonly app: App,
    private readonly settings: IssuesSettings,
  ) {}

  invalidate(): void {
    this.cache = null;
    this.inFlight = null;
    this.generation += 1;
  }

  async migrateIssuesFolder(): Promise<void> {
    const newFolder = normalizePath(this.settings.issuesFolder);
    const adapter = this.app.vault.adapter;

    if (!(await adapter.exists(newFolder))) {
      try {
        await adapter.mkdir(newFolder);
      } catch {
        // Already exists — safe to continue.
      }
    }

    // Migrate from all legacy folder locations to the configured folder.
    // Legacy folders are never created again — only read from for migration.
    const legacyFolders = [
      ISSUES_FOLDER_HIDDEN_LEGACY,
      ISSUES_FOLDER_VISIBLE_LEGACY,
      ' Issues', // the v0.5 default folder, with the leading space
    ];
    for (const legacy of legacyFolders) {
      const legacyPath = normalizePath(legacy);
      if (legacyPath !== newFolder) {
        await this.migrateFolderContents(legacyPath, newFolder);
      }
    }
    this.invalidate();
  }

  /**
   * Moves every .md file from `sourceFolder` into `destFolder` using the raw
   * filesystem adapter, skipping anything already present at the
   * destination, then removes `sourceFolder` if it ends up empty.
   */
  private async migrateFolderContents(sourceFolder: string, destFolder: string): Promise<void> {
    const adapter = this.app.vault.adapter;

    if (sourceFolder === destFolder) return;
    if (!(await adapter.exists(sourceFolder))) return;

    const { files } = await adapter.list(sourceFolder);

    for (const filePath of files) {
      if (!filePath.toLowerCase().endsWith('.md')) continue;

      const fileName = filePath.slice(filePath.lastIndexOf('/') + 1);
      // Prevent path traversal: reject filenames containing directory traversal sequences
      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        console.warn(`Vault Issues: skipping suspicious filename during migration: ${fileName}`);
        continue;
      }
      const destPath = normalizePath(`${destFolder}/${fileName}`);

      if (await adapter.exists(destPath)) {
        // Already migrated (e.g. by an earlier pass, or a previous run) —
        // leave the destination copy alone and just drop this duplicate.
        await adapter.remove(filePath);
        continue;
      }

      const content = await adapter.read(filePath);
      await adapter.write(destPath, content);
      await adapter.remove(filePath);
    }

    try {
      const remaining = await adapter.list(sourceFolder);
      if (remaining.files.length === 0 && remaining.folders.length === 0) {
        await adapter.rmdir(sourceFolder, false);
      }
    } catch {
      // Not empty, or other error — leave the legacy folder in place.
    }
  }

  /**
   * Moves every issue note from `fromFolder` into `toFolder`.
   *
   * The old folder is only removed once nothing is left in it — a folder the
   * user also keeps their own notes in must survive the move. Files are moved
   * with `fileManager.renameFile` so Obsidian rewrites any links pointing at
   * them, and the destination is never overwritten.
   */
  async moveIssuesFolder(
    fromFolder: string,
    toFolder: string,
    prefix: string = this.settings.issuePrefix,
  ): Promise<{ moved: number; skipped: number; oldFolderRemoved: boolean }> {
    const from = normalizePath(fromFolder);
    const to = normalizePath(toFolder);

    if (from === to) return { moved: 0, skipped: 0, oldFolderRemoved: false };

    const source = this.app.vault.getFolderByPath(from);
    if (source === null) return { moved: 0, skipped: 0, oldFolderRemoved: false };

    if (this.app.vault.getFolderByPath(to) === null) {
      await this.app.vault.createFolder(to);
    }

    // The prefix is a parameter rather than a read of `this.settings`, because
    // a combined rename-and-move applies the rename first: by this point the
    // files on disk already carry the *new* prefix while the live settings
    // still hold the old one.
    const candidates = this.app.vault.getMarkdownFiles();
    const plan = planFolderMove(
      candidates.map(toPlannable),
      from,
      to,
      prefix,
      this.occupiedPaths(candidates, to),
    );

    const byPath = new Map(candidates.map((file) => [file.path, file]));
    let moved = 0;

    for (const operation of plan.operations) {
      const file = byPath.get(joinPath(operation.file.parentPath, operation.file.name));
      if (file === undefined) continue;
      await this.app.fileManager.renameFile(file, normalizePath(operation.targetPath));
      moved += 1;
    }

    const oldFolderRemoved = await this.removeFolderIfEmpty(from);
    this.invalidate();

    return { moved, skipped: plan.skipped.length, oldFolderRemoved };
  }

  /**
   * Paths already taken inside `folder`, so a plan never schedules a move or
   * rename over an existing file.
   */
  private occupiedPaths(files: TFile[], folder: string): Set<string> {
    const taken = new Set<string>();
    for (const file of files) {
      if (file.parent?.path === folder) taken.add(file.path);
    }
    return taken;
  }

  /** Trashes a folder only when it holds no files and no subfolders. */
  private async removeFolderIfEmpty(folderPath: string): Promise<boolean> {
    const folder = this.app.vault.getFolderByPath(folderPath);
    if (folder === null) return false;
    if (folder.children.length > 0) return false;

    await this.app.fileManager.trashFile(folder);
    return true;
  }

  /**
   * Renames every issue from one ID prefix to another: the file, its `id`
   * frontmatter, and the entry in each linked source note's `issues` list.
   *
   * Without this a prefix change orphans the entire backlog — the files stop
   * matching the filename pattern and simply vanish from the view.
   */
  async renameIssuePrefix(
    fromPrefix: string,
    toPrefix: string,
  ): Promise<{ renamed: number; skipped: number }> {
    if (fromPrefix === toPrefix) return { renamed: 0, skipped: 0 };

    const folder = normalizePath(this.settings.issuesFolder);
    const candidates = this.app.vault.getMarkdownFiles();
    const plan = planPrefixRename(
      candidates.map(toPlannable),
      folder,
      fromPrefix,
      toPrefix,
      this.occupiedPaths(candidates, folder),
    );

    const byPath = new Map(candidates.map((file) => [file.path, file]));
    let renamed = 0;

    for (const operation of plan.operations) {
      const file = byPath.get(joinPath(operation.file.parentPath, operation.file.name));
      if (file === undefined) continue;

      // Read the source link before renaming, so the note's `issues` list can
      // be repointed at the new ID.
      const source = await this.readSourcePath(file);

      await this.app.fileManager.renameFile(file, normalizePath(operation.targetPath));
      await this.writeIssueFrontmatter(file, (fm) => {
        fm.id = operation.newId;
      });

      if (source.length > 0) {
        await this.replaceIssueIdInNote(source, operation.oldId, operation.newId);
      }

      renamed += 1;
    }

    this.invalidate();
    return { renamed, skipped: plan.skipped.length };
  }

  private async readSourcePath(file: TFile): Promise<string> {
    const content = await this.app.vault.cachedRead(file);
    return toStringValue(this.parseFrontmatter(content).source, '');
  }

  private async replaceIssueIdInNote(
    notePath: string,
    oldId: string,
    newId: string,
  ): Promise<void> {
    const note = this.app.vault.getAbstractFileByPath(notePath);
    if (!(note instanceof TFile)) return;

    await this.app.fileManager.processFrontMatter(note, (fm: Frontmatter) => {
      const existing = toStringArray(fm[ISSUES_FRONTMATTER_KEY]);
      if (!existing.includes(oldId)) return;
      fm[ISSUES_FRONTMATTER_KEY] = existing.map((id) => (id === oldId ? newId : id));
    });
  }

  async ensureIssuesFolder(): Promise<void> {
    const folderPath = normalizePath(this.settings.issuesFolder);

    if (this.app.vault.getFolderByPath(folderPath) !== null) {
      return;
    }

    await this.app.vault.createFolder(folderPath);
  }

  async createIssue(data: IssueData): Promise<TFile> {
    await this.ensureIssuesFolder();

    const id = this.getNextIssueId();
    const path = normalizePath(`${this.settings.issuesFolder}/${id}.md`);
    const file = await this.app.vault.create(path, DEFAULT_ISSUE_BODY);

    await this.writeIssueFrontmatter(file, (fm) => {
      fm.id = id;
      applyIssueData(fm, data);
    });

    return file;
  }

  async listIssues(): Promise<Issue[]> {
    if (this.cache !== null) return this.cache;
    if (this.inFlight !== null) return this.inFlight;

    const generation = this.generation;
    this.inFlight = (async () => {
      const files = this.getIssueFiles();
      const issues = await Promise.all(files.map((file) => this.readIssue(file)));
      issues.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      // If generation changed during read, the data is stale — don't cache it,
      // and don't return it to callers. Instead, clear inFlight and retry.
      if (this.generation !== generation) {
        this.inFlight = null;
        return this.listIssues();
      }
      this.cache = issues;
      this.inFlight = null;
      return issues;
    })();

    return this.inFlight;
  }

  async getAllLabels(): Promise<string[]> {
    const issues = await this.listIssues();
    const labelSet = new Set<string>();
    for (const issue of issues) {
      for (const label of issue.labels) {
        labelSet.add(label);
      }
    }
    return [...labelSet].sort();
  }

  async getAllProjects(): Promise<string[]> {
    const issues = await this.listIssues();
    const projectSet = new Set<string>();
    for (const issue of issues) {
      if (issue.project.length > 0) {
        projectSet.add(issue.project);
      }
    }
    return [...projectSet].sort();
  }

  async deleteIssue(file: TFile): Promise<void> {
    await this.app.fileManager.trashFile(file);
    this.invalidate();
  }

  async countIssuesForNote(notePath: string): Promise<number> {
    const issues = await this.listIssues();
    return issues.filter((i) => i.source === notePath).length;
  }

  async unlinkIssueFromNote(issueId: string, notePath: string): Promise<void> {
    if (notePath.length === 0) return;

    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;

    await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
      const existing = toStringArray(fm[ISSUES_FRONTMATTER_KEY]);
      const updated = existing.filter((id) => id !== issueId);
      if (updated.length === 0) {
        delete fm[ISSUES_FRONTMATTER_KEY];
      } else {
        fm[ISSUES_FRONTMATTER_KEY] = updated;
      }
    });
  }

  async clearSourceForDeletedNote(notePath: string): Promise<void> {
    const issues = await this.listIssues();

    for (const issue of issues) {
      if (issue.source !== notePath) continue;
      await this.writeIssueFrontmatter(issue.file, (fm) => {
        delete fm.source;
      });
    }
  }

  async updateSourcePath(oldPath: string, newPath: string): Promise<void> {
    const issues = await this.listIssues();

    for (const issue of issues) {
      if (issue.source !== oldPath) continue;
      await this.writeIssueFrontmatter(issue.file, (fm) => {
        fm.source = newPath;
      });
    }
  }

  /** Cycles open → in progress → closed → open. */
  async cycleIssueStatus(file: TFile): Promise<IssueStatus> {
    let result: IssueStatus = 'open';
    await this.writeIssueFrontmatter(file, (fm) => {
      result = nextStatus(normalizeStatus(fm.status));
      fm.status = result;
    });
    return result;
  }

  async updateIssue(file: TFile, changes: Partial<IssueData>): Promise<void> {
    await this.writeIssueFrontmatter(file, (fm) => {
      applyIssueData(fm, changes);
    });
  }

  async linkIssueToNote(notePath: string, issueId: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;

    await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
      const existing = toStringArray(fm[ISSUES_FRONTMATTER_KEY]);
      if (existing.includes(issueId)) return;
      fm[ISSUES_FRONTMATTER_KEY] = [...existing, issueId];
    });
  }

  /**
   * All issue writes go through Obsidian's `processFrontMatter`, which parses,
   * mutates and re-serialises the YAML block itself. The previous hand-rolled
   * serialiser wrapped every value in double quotes without escaping, so a
   * title containing `"` produced invalid YAML — the parser then failed
   * silently and the issue lost every field. `processFrontMatter` also leaves
   * the note body untouched, so it can't clobber unsaved editor changes the
   * way a full read-modify-write of the file could.
   */
  private async writeIssueFrontmatter(
    file: TFile,
    mutate: (fm: Frontmatter) => void,
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
      mutate(fm);
      reorderFrontmatter(fm);
    });
    this.invalidate();
  }

  private getIssueFiles(): TFile[] {
    return issueFilesInFolder(
      this.app.vault.getMarkdownFiles(),
      normalizePath(this.settings.issuesFolder),
      this.settings.issuePrefix,
    );
  }

  private getNextIssueId(): string {
    return getNextIssueId(this.getIssueFiles(), this.settings.issuePrefix);
  }

  private async readIssue(file: TFile): Promise<Issue> {
    const content = await this.app.vault.cachedRead(file);
    const frontmatter = this.parseFrontmatter(content);
    const body = extractBody(content);

    return {
      id: toStringValue(frontmatter.id, file.basename),
      title: toStringValue(frontmatter.title, file.basename),
      status: normalizeStatus(frontmatter.status),
      priority: normalizePriority(frontmatter.priority),
      project: toStringValue(frontmatter.project, ''),
      source: toStringValue(frontmatter.source, ''),
      labels: toStringArray(frontmatter.labels),
      due: toDateValue(frontmatter.due, ''),
      // Normalised to ISO so `created` sorts correctly even when a note was
      // hand-edited to the DD/MM/YYYY display format.
      created: normalizeCreated(
        toDateValue(frontmatter.created, new Date().toISOString().slice(0, 10)),
      ),
      body,
      file,
    };
  }

  private parseFrontmatter(content: string): Frontmatter {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

    if (match?.[1] === undefined) {
      return {};
    }

    try {
      const parsed: unknown = parseYaml(match[1]);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

function isRecord(value: unknown): value is Frontmatter {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function normalizeCreated(value: string): string {
  const iso = toIsoDate(value);
  return iso.length > 0 ? iso : value;
}

/** `parseYaml` turns unquoted ISO dates into `Date` objects. */
function toDateValue(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return toStringValue(value, fallback);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    // Tolerate a single scalar where a list is expected.
    return [value.trim()];
  }
  return [];
}

function extractBody(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (match?.[0] === undefined) {
    return content;
  }
  return content.slice(match[0].length);
}

/** Writes a value, or removes the key entirely when the value is empty. */
function setOrDelete(fm: Frontmatter, key: string, value: string): void {
  if (value.length === 0) {
    delete fm[key];
  } else {
    fm[key] = value;
  }
}

function applyIssueData(fm: Frontmatter, data: Partial<IssueData>): void {
  if (data.title !== undefined) fm.title = data.title;
  if (data.status !== undefined) fm.status = normalizeStatus(data.status);
  if (data.priority !== undefined) fm.priority = normalizePriority(data.priority);
  if (data.project !== undefined) setOrDelete(fm, 'project', data.project.trim());
  if (data.source !== undefined) setOrDelete(fm, 'source', data.source.trim());
  if (data.due !== undefined) setOrDelete(fm, 'due', toDisplayDate(data.due));
  if (data.created !== undefined) setOrDelete(fm, 'created', data.created);
  if (data.labels !== undefined) {
    const labels = toStringArray(data.labels);
    if (labels.length === 0) {
      delete fm.labels;
    } else {
      fm.labels = labels;
    }
  }
}

/**
 * Rewrites the object's keys in canonical order. Only applied to issue files —
 * reordering a user's own note frontmatter would be intrusive.
 */
function reorderFrontmatter(fm: Frontmatter): void {
  const snapshot: Frontmatter = { ...fm };
  for (const key of Object.keys(fm)) {
    delete fm[key];
  }
  for (const key of FRONTMATTER_FIELD_ORDER) {
    if (key in snapshot) fm[key] = snapshot[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (!(key in fm)) fm[key] = value;
  }
}

/** Projects a vault file onto the shape the migration planners work with. */
function toPlannable(file: TFile): PlannableFile {
  return { basename: file.basename, name: file.name, parentPath: file.parent?.path ?? '' };
}

function joinPath(folder: string, name: string): string {
  return folder.length > 0 ? `${folder}/${name}` : name;
}
