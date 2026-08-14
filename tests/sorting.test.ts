import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Issue } from '../src/types.ts';
import { sortIssues } from '../src/filters/issue-sort.ts';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'ISSUE-001',
    title: 'Test issue',
    status: 'open',
    priority: 'medium',
    project: '',
    source: '',
    labels: [],
    due: '',
    created: '2026-08-01',
    body: '',
    file: undefined as unknown as Issue['file'],
    ...overrides,
  };
}

describe('sortIssues', () => {
  describe('created date', () => {
    const issues = [
      makeIssue({ id: 'ISSUE-003', created: '2026-08-10' }),
      makeIssue({ id: 'ISSUE-001', created: '2026-08-01' }),
      makeIssue({ id: 'ISSUE-002', created: '2026-08-05' }),
    ];

    it('sorts ascending (oldest first)', () => {
      const result = sortIssues(issues, 'created', 'asc');
      assert.deepEqual(
        result.map((i) => i.id),
        ['ISSUE-001', 'ISSUE-002', 'ISSUE-003'],
      );
    });

    it('sorts descending (newest first)', () => {
      const result = sortIssues(issues, 'created', 'desc');
      assert.deepEqual(
        result.map((i) => i.id),
        ['ISSUE-003', 'ISSUE-002', 'ISSUE-001'],
      );
    });
  });

  describe('priority', () => {
    const issues = [
      makeIssue({ id: 'ISSUE-001', priority: 'low' }),
      makeIssue({ id: 'ISSUE-002', priority: 'critical' }),
      makeIssue({ id: 'ISSUE-003', priority: 'medium' }),
      makeIssue({ id: 'ISSUE-004', priority: 'high' }),
    ];

    it('sorts ascending (low to high)', () => {
      const result = sortIssues(issues, 'priority', 'asc');
      assert.deepEqual(
        result.map((i) => i.priority),
        ['low', 'medium', 'high', 'critical'],
      );
    });

    it('sorts descending (high to low)', () => {
      const result = sortIssues(issues, 'priority', 'desc');
      assert.deepEqual(
        result.map((i) => i.priority),
        ['critical', 'high', 'medium', 'low'],
      );
    });
  });

  describe('due date', () => {
    const issues = [
      makeIssue({ id: 'ISSUE-001', due: '2026-08-20', created: '2026-08-01' }),
      makeIssue({ id: 'ISSUE-003', due: '', created: '2026-08-03' }), // undated
      makeIssue({ id: 'ISSUE-002', due: '2026-08-10', created: '2026-08-02' }),
      makeIssue({ id: 'ISSUE-004', due: 'tomorrow maybe', created: '2026-08-04' }), // malformed → treated as empty
    ];

    it('sorts ascending (soonest first), undated/malformed last', () => {
      const result = sortIssues(issues, 'due', 'asc');
      assert.deepEqual(
        result.map((i) => i.id),
        ['ISSUE-002', 'ISSUE-001', 'ISSUE-003', 'ISSUE-004'],
      );
    });

    it('sorts descending (latest first), undated/malformed last', () => {
      const result = sortIssues(issues, 'due', 'desc');
      assert.deepEqual(
        result.map((i) => i.id),
        ['ISSUE-001', 'ISSUE-002', 'ISSUE-003', 'ISSUE-004'],
      );
    });
  });

  describe('tie-breaking by ID', () => {
    it('breaks ties with numeric ID order (asc)', () => {
      const issues = [
        makeIssue({ id: 'ISSUE-010', created: '2026-08-01' }),
        makeIssue({ id: 'ISSUE-002', created: '2026-08-01' }),
        makeIssue({ id: 'ISSUE-005', created: '2026-08-01' }),
      ];
      const result = sortIssues(issues, 'created', 'asc');
      assert.deepEqual(
        result.map((i) => i.id),
        ['ISSUE-002', 'ISSUE-005', 'ISSUE-010'],
      );
    });

    it('breaks ties with numeric ID order (desc)', () => {
      const issues = [
        makeIssue({ id: 'ISSUE-002', created: '2026-08-01' }),
        makeIssue({ id: 'ISSUE-010', created: '2026-08-01' }),
        makeIssue({ id: 'ISSUE-005', created: '2026-08-01' }),
      ];
      const result = sortIssues(issues, 'created', 'desc');
      assert.deepEqual(
        result.map((i) => i.id),
        ['ISSUE-010', 'ISSUE-005', 'ISSUE-002'],
      );
    });
  });

  describe('malformed dates', () => {
    it('treats malformed due date as empty (sorts last)', () => {
      const issues = [
        makeIssue({ id: 'ISSUE-001', due: '2026-08-10' }),
        makeIssue({ id: 'ISSUE-002', due: 'not a date' }),
        makeIssue({ id: 'ISSUE-003', due: '2026-08-05' }),
      ];
      const result = sortIssues(issues, 'due', 'asc');
      assert.deepEqual(
        result.map((i) => i.id),
        ['ISSUE-003', 'ISSUE-001', 'ISSUE-002'],
      );
    });
  });
});
