import type { IssueStatus } from './types';

export const VIEW_TYPE_ISSUES = 'obsidian-issues-view';
export const ISSUES_FOLDER = 'Issues';
export const ISSUE_FILENAME_PATTERN = /^ISSUE-(\d+)$/;
export const ISSUE_STATUSES: readonly IssueStatus[] = ['open', 'closed'];
export const FRONTMATTER_FIELD_ORDER: readonly string[] = [
  'id', 'title', 'status', 'created',
];
