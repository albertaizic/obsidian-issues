import { App, normalizePath, parseYaml, TFile } from 'obsidian';
import {
  DEFAULT_ISSUE_BODY,
  FRONTMATTER_FIELD_ORDER,
  ISSUES_FOLDER,
  ISSUES_FOLDER_HIDDEN_LEGACY,
  ISSUES_FOLDER_VISIBLE_LEGACY,
  ISSUES_FRONTMATTER_KEY,
  ISSUE_FILENAME_PATTERN,
  nextStatus,
  normalizePriority,
  normalizeStatus,
} from './constants';
import { toDisplayDate, toIsoDate } from './dates';
import type { Issue, IssueData, IssueStatus } from './types';

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

  constructor(private readonly app: App) {}

  invalidate(): void {
    this.cache = null;
    this.inFlight = null;
    this.generation += 1;
  }

  async migrateIssuesFolder(): Promise<void> {
    const newFolder = normalizePath(ISSUES_FOLDER);
    const adapter = this.app.vault.adapter;

    if (!(await adapter.exists(newFolder))) {
      try {
        await adapter.mkdir(newFolder);
      } catch {
        // Already exists — safe to continue.
      }
    }

    // Both legacy folders are migrated using the same low-level adapter API
    // (rather than mixing it with the vault's TFile/TFolder API) so the two
    // passes can't race against the vault's index — e.g. one pass writing a
    // file the vault doesn't know about yet, which the other pass would then
    // fail to detect as a conflict.
    await this.migrateFolderContents(normalizePath(ISSUES_FOLDER_HIDDEN_LEGACY), newFolder);
    await this.migrateFolderContents(normalizePath(ISSUES_FOLDER_VISIBLE_LEGACY), newFolder);
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

  async ensureIssuesFolder(): Promise<void> {
    const folderPath = normalizePath(ISSUES_FOLDER);

    if (this.app.vault.getFolderByPath(folderPath) !== null) {
      return;
    }

    await this.app.vault.createFolder(folderPath);
  }

  async createIssue(data: IssueData): Promise<TFile> {
    await this.ensureIssuesFolder();

    const id = this.getNextIssueId();
    const path = normalizePath(`${ISSUES_FOLDER}/${id}.md`);
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
      if (this.generation === generation) {
        this.cache = issues;
        this.inFlight = null;
      }
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
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.parent?.path === normalizePath(ISSUES_FOLDER))
      .filter((file) => ISSUE_FILENAME_PATTERN.test(file.basename));
  }

  private getNextIssueId(): string {
    const highestNumber = this.getIssueFiles().reduce((highest, file) => {
      const match = file.basename.match(ISSUE_FILENAME_PATTERN);
      const value = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
      return Number.isNaN(value) ? highest : Math.max(highest, value);
    }, 0);

    return `ISSUE-${String(highestNumber + 1).padStart(3, '0')}`;
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
