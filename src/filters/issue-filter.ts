import type { Issue, IssuePriority, IssueStatus } from '../types';
import type { IssuesSettings } from '../settings';
import { shortIssueId } from '../utils/issue-id.ts';

export type SortBy = 'created' | 'due' | 'priority';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  search: string;
  status: IssueStatus[];
  project: string[];
  priority: IssuePriority[];
  labels: string[];
  sortBy: SortBy;
  sortDir: SortDir;
}

/** Creates the initial filter state from plugin settings. */
export function defaultFilters(settings: IssuesSettings): FilterState {
  return {
    search: '',
    status: [],
    project: [],
    priority: [],
    labels: [],
    sortBy: settings.defaultSortBy,
    sortDir: settings.defaultSortDir,
  };
}

/** Resets all filters to defaults (sort falls back to settings). */
export function resetFilters(settings: IssuesSettings): FilterState {
  return defaultFilters(settings);
}

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.search.length > 0 ||
    filters.status.length > 0 ||
    filters.project.length > 0 ||
    filters.priority.length > 0 ||
    filters.labels.length > 0
  );
}

export function filterIssues(issues: Issue[], filters: FilterState): Issue[] {
  const query = filters.search.trim().toLowerCase();

  return issues.filter((issue) => {
    if (query.length > 0) {
      const haystack = [
        issue.title,
        issue.body,
        issue.project,
        shortIssueId(issue.id),
        issue.id,
        ...issue.labels,
      ]
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.status.length > 0 && !filters.status.includes(issue.status)) {
      return false;
    }
    if (filters.project.length > 0 && !filters.project.includes(issue.project)) {
      return false;
    }
    if (filters.priority.length > 0 && !filters.priority.includes(issue.priority)) {
      return false;
    }
    if (filters.labels.length > 0) {
      if (!issue.labels.some((l) => filters.labels.includes(l))) {
        return false;
      }
    }
    return true;
  });
}
