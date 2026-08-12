import type { IssuePriority, IssueStatus } from './types';

export const VIEW_TYPE_ISSUES = 'obsidian-issues-view';
export const ISSUES_FOLDER = 'Issues';
export const ISSUE_FILENAME_PATTERN = /^ISSUE-(\d+)$/;
export const ISSUE_STATUSES: readonly IssueStatus[] = [
  'open', 'in-progress', 'closed',
];
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  'in-progress': 'In Progress',
  closed: 'Closed',
};
export const ISSUE_PRIORITIES: readonly IssuePriority[] = [
  'low', 'medium', 'high', 'critical',
];
export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};
export const FRONTMATTER_FIELD_ORDER: readonly string[] = [
  'id', 'title', 'status', 'priority', 'project', 'source', 'labels', 'due', 'created', 'issues',
];

export const ISSUES_FRONTMATTER_KEY = 'issues';
