import { ISSUE_PRIORITIES } from '../constants.ts';
import { compareDueDates, compareIsoDates, toIsoDate } from '../dates.ts';
import type { Issue } from '../types';
import type { SortBy, SortDir } from './issue-filter';

/**
 * Sorts issues by the given field and direction.
 * - Undated `due` issues sort last in both directions.
 * - Ties break by numeric ID order (ISSUE-002 before ISSUE-010).
 */
export function sortIssues(issues: Issue[], sortBy: SortBy, sortDir: SortDir): Issue[] {
  const multiplier = sortDir === 'asc' ? 1 : -1;

  return [...issues].sort((a, b) => {
    let compareValue = 0;

    if (sortBy === 'due') {
      const aEmpty = toIsoDate(a.due).length === 0;
      const bEmpty = toIsoDate(b.due).length === 0;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (aEmpty && bEmpty) {
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      }
      compareValue = compareDueDates(a.due, b.due);
    } else if (sortBy === 'created') {
      compareValue = compareIsoDates(a.created, b.created);
    } else {
      compareValue =
        ISSUE_PRIORITIES.indexOf(a.priority) - ISSUE_PRIORITIES.indexOf(b.priority);
    }

    if (compareValue === 0) {
      return a.id.localeCompare(b.id, undefined, { numeric: true }) * multiplier;
    }

    return compareValue * multiplier;
  });
}
