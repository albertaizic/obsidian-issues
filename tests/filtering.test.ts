import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Issue } from '../src/types.ts';
import { defaultFilters, filterIssues, hasActiveFilters, type FilterState, resetFilters } from '../src/filters/issue-filter.ts';
import type { IssuesSettings } from '../src/settings.ts';

const mockSettings: IssuesSettings = {
  issuesFolder: 'Issues',
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

describe('filterIssues', () => {
  const issues = [
    makeIssue({ id: 'ISSUE-001', title: 'Fix login', labels: ['backend'], priority: 'high', project: 'Auth' }),
    makeIssue({ id: 'ISSUE-002', title: 'Design homepage', labels: ['frontend', 'ui'], priority: 'medium', project: 'Web', body: 'Homepage wireframes' }),
    makeIssue({ id: 'ISSUE-003', title: 'Write docs', labels: ['docs', 'backend'], priority: 'low', project: 'Auth', body: 'API reference documentation' }),
  ];

  describe('search filter', () => {
    it('matches title (case-insensitive)', () => {
      const filters = { ...defaultFilters(mockSettings), search: 'LOGIN' };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'ISSUE-001');
    });

    it('matches body text', () => {
      const filterIssuesWithBody = (query: string) =>
        filterIssues(
          [makeIssue({ body: 'The login page throws an error', title: 'Other' })],
          { ...defaultFilters(mockSettings), search: query },
        );
      assert.equal(filterIssuesWithBody('error').length, 1);
    });

    it('matches labels', () => {
      const filters = { ...defaultFilters(mockSettings), search: 'docs' };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'ISSUE-003');
    });

    it('matches project', () => {
      const filters = { ...defaultFilters(mockSettings), search: 'auth' };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 2);
    });

    it('matches short issue ID (#1)', () => {
      const filters = { ...defaultFilters(mockSettings), search: '#2' };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'ISSUE-002');
    });

    it('matches full issue ID', () => {
      const filters = { ...defaultFilters(mockSettings), search: 'ISSUE-003' };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'ISSUE-003');
    });

    it('returns all when search is empty', () => {
      const filters = defaultFilters(mockSettings);
      assert.equal(filterIssues(issues, filters).length, 3);
    });
  });

  describe('status filter', () => {
    it('filters by single status', () => {
      const filters = { ...defaultFilters(mockSettings), status: ['open'] };
      const withStatuses = issues.map((i) => ({ ...i, status: i.id === 'ISSUE-002' ? 'closed' as const : 'open' as const }));
      const result = filterIssues(withStatuses, filters);
      assert.equal(result.length, 2);
    });

    it('filters by multiple statuses', () => {
      const filters = { ...defaultFilters(mockSettings), status: ['open', 'in-progress'] };
      const result = filterIssues(
        [
          makeIssue({ id: 'ISSUE-001', status: 'open' }),
          makeIssue({ id: 'ISSUE-002', status: 'closed' }),
          makeIssue({ id: 'ISSUE-003', status: 'in-progress' }),
        ],
        filters,
      );
      assert.equal(result.length, 2);
    });

    it('returns all when no status selected', () => {
      const result = filterIssues(issues, defaultFilters(mockSettings));
      assert.equal(result.length, 3);
    });
  });

  describe('priority filter', () => {
    it('filters by single priority', () => {
      const filters = { ...defaultFilters(mockSettings), priority: ['high'] };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'ISSUE-001');
    });

    it('filters by multiple priorities', () => {
      const filters = { ...defaultFilters(mockSettings), priority: ['high', 'low'] };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 2);
    });
  });

  describe('project filter', () => {
    it('filters by single project', () => {
      const filters = { ...defaultFilters(mockSettings), project: ['Auth'] };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 2);
    });
  });

  describe('label filter', () => {
    it('returns issues that have at least one matching label', () => {
      const filters = { ...defaultFilters(mockSettings), labels: ['backend'] };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 2);
    });

    it('does not require ALL labels to match', () => {
      const filters = { ...defaultFilters(mockSettings), labels: ['docs'] };
      const result = filterIssues(issues, filters);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'ISSUE-003');
    });
  });
});

describe('hasActiveFilters', () => {
  it('returns false when all filters are empty', () => {
    assert.equal(hasActiveFilters(defaultFilters(mockSettings)), false);
  });

  it('returns true for search', () => {
    assert.equal(hasActiveFilters({ ...defaultFilters(mockSettings), search: 'bug' }), true);
  });

  it('returns true for status', () => {
    assert.equal(hasActiveFilters({ ...defaultFilters(mockSettings), status: ['open'] }), true);
  });

  it('returns true for labels', () => {
    assert.equal(hasActiveFilters({ ...defaultFilters(mockSettings), labels: ['backend'] }), true);
  });

  it('does not consider sort settings as active filters', () => {
    const filters: FilterState = {
      ...defaultFilters(mockSettings),
      sortBy: 'due',
      sortDir: 'asc',
    };
    assert.equal(hasActiveFilters(filters), false);
  });
});

describe('resetFilters', () => {
  it('resets all filters to defaults', () => {
    const result = resetFilters(mockSettings);
    assert.equal(result.search, '');
    assert.deepEqual(result.status, []);
    assert.deepEqual(result.project, []);
    assert.deepEqual(result.priority, []);
    assert.deepEqual(result.labels, []);
    assert.equal(result.sortBy, 'created');
    assert.equal(result.sortDir, 'desc');
  });
});
