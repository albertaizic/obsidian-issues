import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { visibleCount, defaultFilters, type FilterState } from '../src/filters/issue-filter.ts';
import type { Issue } from '../src/types.ts';
import type { IssuesSettings } from '../src/settings.ts';

const mockSettings: IssuesSettings = {
  issuesFolder: ' Issues',
  issuePrefix: 'ISSUE',
  defaultPriority: 'medium',
  viewMode: 'list',
  confirmDelete: true,
  defaultSortBy: 'created',
  defaultSortDir: 'desc',
};

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'ISSUE-001',
    title: 'Fix login bug',
    status: 'open',
    priority: 'medium',
    project: 'Auth',
    source: '',
    labels: [],
    due: '',
    created: '2026-08-10',
    body: 'The login page throws an error on submit.',
    file: undefined as unknown as Issue['file'],
    ...overrides,
  };
}

describe('visibleCount', () => {
  const issues = [
    makeIssue({ id: 'ISSUE-001', title: 'Fix login', labels: ['backend'], priority: 'high', project: 'Auth' }),
    makeIssue({ id: 'ISSUE-002', title: 'Design homepage', labels: ['frontend', 'ui'], priority: 'medium', project: 'Web', body: 'Homepage wireframes' }),
    makeIssue({ id: 'ISSUE-003', title: 'Write docs', labels: ['docs', 'backend'], priority: 'low', project: 'Auth', body: 'API reference documentation' }),
  ];

  it('no filters: total = visible = issues.length', () => {
    const filters = defaultFilters(mockSettings);
    const result = visibleCount(issues, filters);
    assert.equal(result.total, 3);
    assert.equal(result.visible, 3);
  });

  it('search matching subset: visible < total', () => {
    const filters: FilterState = { ...defaultFilters(mockSettings), search: 'backend' };
    const result = visibleCount(issues, filters);
    assert.equal(result.total, 3);
    assert.equal(result.visible, 2);
  });

  it('search matching nothing: visible = 0', () => {
    const filters: FilterState = { ...defaultFilters(mockSettings), search: 'nonexistent' };
    const result = visibleCount(issues, filters);
    assert.equal(result.total, 3);
    assert.equal(result.visible, 0);
  });

  it('status filter: visible = matching count only', () => {
    const withStatuses = [
      makeIssue({ id: 'ISSUE-001', status: 'open' }),
      makeIssue({ id: 'ISSUE-002', status: 'closed' }),
      makeIssue({ id: 'ISSUE-003', status: 'in-progress' }),
    ];
    const filters: FilterState = { ...defaultFilters(mockSettings), status: ['closed'] };
    const result = visibleCount(withStatuses, filters);
    assert.equal(result.total, 3);
    assert.equal(result.visible, 1);
  });

  it('multiple filters combined: visible = count matching all', () => {
    const filters: FilterState = {
      ...defaultFilters(mockSettings),
      search: 'auth',
      priority: ['high'],
    };
    const result = visibleCount(issues, filters);
    assert.equal(result.total, 3);
    assert.equal(result.visible, 1);
  });

  it('empty issue list: total = visible = 0', () => {
    const filters = defaultFilters(mockSettings);
    const result = visibleCount([], filters);
    assert.equal(result.total, 0);
    assert.equal(result.visible, 0);
  });
});
