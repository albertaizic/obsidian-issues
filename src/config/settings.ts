import type { IssuePriority } from '../types';
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
}

/**
 * Coerces a user-entered folder name: trims whitespace, rejects dot-prefixed
 * names (Obsidian's Vault API silently ignores folders starting with "."),
 * and falls back to the default.
 */
function normalizeFolder(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ISSUES_FOLDER;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('.')) return DEFAULT_ISSUES_FOLDER;
  return trimmed;
}

function normalizePrefix(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ISSUE_PREFIX;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('.')) return DEFAULT_ISSUE_PREFIX;
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
