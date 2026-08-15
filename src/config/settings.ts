import type { IssuePriority } from '../types.ts';
import {
  DEFAULT_ISSUE_PREFIX,
  DEFAULT_ISSUES_FOLDER,
  ISSUE_PRIORITIES,
} from '../constants.ts';

export type IssueViewMode = 'list' | 'kanban';

export interface IssuesSettings {
  issuesFolder: string;
  issuePrefix: string;
  defaultPriority: IssuePriority;
  /** Persisted across restarts — previously this lived in sessionStorage. */
  viewMode: IssueViewMode;
  confirmDelete: boolean;
  defaultSortBy: 'created' | 'due' | 'priority';
  defaultSortDir: 'asc' | 'desc';
}

export const DEFAULT_SETTINGS: IssuesSettings = {
  issuesFolder: DEFAULT_ISSUES_FOLDER,
  issuePrefix: DEFAULT_ISSUE_PREFIX,
  defaultPriority: 'medium',
  viewMode: 'list',
  confirmDelete: true,
  defaultSortBy: 'created',
  defaultSortDir: 'desc',
};

/**
 * The subset of the plugin the issues view needs. Declared here rather than
 * importing the plugin class so `issues-view.ts` and `main.ts` don't form an
 * import cycle.
 */
export interface IssuesViewHost {
  settings: IssuesSettings;
  saveSettings(): Promise<void>;
  /**
   * Commits a staged settings draft: runs any folder/prefix migration, stores
   * the result, and resets the issues view. Returns a human-readable summary
   * of what was migrated.
   */
  applySettings(next: IssuesSettings): Promise<string[]>;
}

/** Characters the major desktop filesystems refuse in a path segment. */
const ILLEGAL_PATH_CHARS = /[\\/:*?"<>|]/;

export interface ValidationResult {
  valid: boolean;
  /** Present when invalid, or when valid but worth flagging. */
  message?: string;
}

/**
 * Validates a folder name for the settings UI.
 *
 * The leading space in the default `" Issues"` is deliberate and must survive:
 * a dot-prefixed folder is invisible to Obsidian's Vault API (getMarkdownFiles,
 * getFolderByPath and search all silently skip paths starting with "."), while
 * a leading space sorts the folder to the top of the file list and is
 * otherwise an ordinary name. Only *trailing* whitespace is stripped, since
 * Windows trims that from real directory names anyway.
 */
export function validateFolder(value: string): ValidationResult {
  const folder = trimTrailing(value);

  if (folder.length === 0) {
    return { valid: false, message: 'Folder name cannot be empty.' };
  }
  if (folder.startsWith('.')) {
    return {
      valid: false,
      message:
        'A folder starting with "." is hidden from Obsidian\'s vault API — issues stored there ' +
        'would be invisible to the plugin. Use a leading space (" Issues") to sort it to the top instead.',
    };
  }
  if (ILLEGAL_PATH_CHARS.test(folder)) {
    return { valid: false, message: 'Folder name cannot contain \\ / : * ? " < > or |' };
  }
  if (folder.endsWith('.')) {
    return { valid: false, message: 'Folder name cannot end with "."' };
  }
  return { valid: true };
}

export function validatePrefix(value: string): ValidationResult {
  const prefix = value.trim();

  if (prefix.length === 0) {
    return { valid: false, message: 'Prefix cannot be empty.' };
  }
  if (prefix.startsWith('.')) {
    return { valid: false, message: 'Prefix cannot start with "."' };
  }
  if (!/[A-Za-z0-9]/.test(prefix)) {
    return { valid: false, message: 'Prefix must contain at least one letter or digit.' };
  }
  return { valid: true };
}

/** Strips trailing whitespace only — a leading space is a valid, useful name. */
function trimTrailing(value: string): string {
  return value.replace(/\s+$/, '');
}

/**
 * Coerces a stored folder name. Unlike the old implementation this preserves a
 * leading space, which `trim()` silently destroyed — turning the default
 * `" Issues"` into `"Issues"` the moment the settings tab was touched, and
 * orphaning every issue already on disk.
 */
export function normalizeFolder(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ISSUES_FOLDER;
  const folder = trimTrailing(value);
  return validateFolder(folder).valid ? folder : DEFAULT_ISSUES_FOLDER;
}

export function normalizePrefix(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ISSUE_PREFIX;
  const trimmed = value.trim();
  if (!validatePrefix(trimmed).valid) return DEFAULT_ISSUE_PREFIX;
  return trimmed.toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
}

export function normalizeSettings(raw: unknown): IssuesSettings {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<IssuesSettings>;
  return {
    issuesFolder: normalizeFolder(data.issuesFolder),
    issuePrefix: normalizePrefix(data.issuePrefix),
    defaultPriority: ISSUE_PRIORITIES.includes(data.defaultPriority as IssuePriority)
      ? (data.defaultPriority as IssuePriority)
      : 'medium',
    viewMode: data.viewMode === 'kanban' ? 'kanban' : 'list',
    confirmDelete: data.confirmDelete !== false,
    defaultSortBy:
      data.defaultSortBy === 'due' || data.defaultSortBy === 'priority'
        ? data.defaultSortBy
        : 'created',
    defaultSortDir: data.defaultSortDir === 'asc' ? 'asc' : 'desc',
  };
}
