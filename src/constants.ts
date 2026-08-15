import type { IssuePriority, IssueStatus } from './types.ts';

export const VIEW_TYPE_ISSUES = 'obsidian-issues-view';
// A leading space, not a dot-prefix. Dot-prefixed folders (e.g. ".Issues")
// are invisible to Obsidian's Vault API (getMarkdownFiles, getFolderByPath,
// search, etc. all silently ignore paths starting with "."). A leading space
// is safe on Windows (only *trailing* whitespace/periods get silently
// trimmed by the OS, not leading), sorts the folder to the top of an
// alphabetical file list, and is otherwise a completely normal folder name
// to both the filesystem and the Vault API.
export const DEFAULT_ISSUES_FOLDER = ' Issues';
export const DEFAULT_ISSUE_PREFIX = 'ISSUE';
// Earlier versions stored issues directly in these folders. Both are
// migrated from automatically on load.
export const ISSUES_FOLDER_HIDDEN_LEGACY = '.Issues';
export const ISSUES_FOLDER_VISIBLE_LEGACY = 'Issues';

// `buildFilenamePattern` lives in utils/issue-id.ts — it was duplicated here,
// and the two copies drifted (only one escaped the prefix before building the
// regex). Import it from there.

export const ISSUE_STATUSES: readonly IssueStatus[] = [
  'open', 'in-progress', 'closed',
];
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  closed: 'Closed',
};
export const DEFAULT_STATUS: IssueStatus = 'open';

export const ISSUE_PRIORITIES: readonly IssuePriority[] = [
  'low', 'medium', 'high', 'critical',
];
export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};
export const DEFAULT_PRIORITY: IssuePriority = 'medium';

export const FRONTMATTER_FIELD_ORDER: readonly string[] = [
  'id', 'title', 'status', 'priority', 'project', 'source', 'labels', 'due', 'created',
];

export const ISSUES_FRONTMATTER_KEY = 'issues';

export const DEFAULT_ISSUE_BODY = 'Describe the issue here.\n';

/**
 * Coerces an arbitrary frontmatter value to a known status. Hand-edited or
 * third-party notes can contain anything; without this an unknown status
 * would match no Kanban column and the issue would silently disappear from
 * the board.
 */
export function normalizeStatus(value: unknown): IssueStatus {
  if (typeof value !== 'string') return DEFAULT_STATUS;
  const candidate = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return ISSUE_STATUSES.includes(candidate as IssueStatus)
    ? (candidate as IssueStatus)
    : DEFAULT_STATUS;
}

export function normalizePriority(value: unknown): IssuePriority {
  if (typeof value !== 'string') return DEFAULT_PRIORITY;
  const candidate = value.trim().toLowerCase();
  return ISSUE_PRIORITIES.includes(candidate as IssuePriority)
    ? (candidate as IssuePriority)
    : DEFAULT_PRIORITY;
}

/** open → in-progress → closed → open. */
export function nextStatus(current: IssueStatus): IssueStatus {
  const index = ISSUE_STATUSES.indexOf(current);
  return ISSUE_STATUSES[(index + 1) % ISSUE_STATUSES.length] ?? DEFAULT_STATUS;
}

export function statusMenuItems(
  current: IssueStatus,
): { value: IssueStatus; label: string; checked: boolean }[] {
  return ISSUE_STATUSES.map((s) => ({
    value: s,
    label: ISSUE_STATUS_LABELS[s],
    checked: s === current,
  }));
}
