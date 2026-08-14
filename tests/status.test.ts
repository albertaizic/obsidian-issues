import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRIORITY,
  DEFAULT_STATUS,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
  nextStatus,
  normalizePriority,
  normalizeStatus,
} from '../src/constants.ts';

describe('normalizeStatus', () => {
  it('accepts canonical status values', () => {
    for (const status of ISSUE_STATUSES) {
      assert.equal(normalizeStatus(status), status);
    }
  });

  it('normalizes spaces and underscores to hyphens', () => {
    assert.equal(normalizeStatus('in progress'), 'in-progress');
    assert.equal(normalizeStatus('In Progress'), 'in-progress');
    assert.equal(normalizeStatus('in_progress'), 'in-progress');
    assert.equal(normalizeStatus('IN_PROGRESS'), 'in-progress');
  });

  it('lowercases mixed-case input', () => {
    assert.equal(normalizeStatus('Open'), 'open');
    assert.equal(normalizeStatus('Closed'), 'closed');
  });

  it('falls back to default for unknown strings', () => {
    assert.equal(normalizeStatus('banana'), DEFAULT_STATUS);
    assert.equal(normalizeStatus('pending'), 'open');
  });

  it('falls back to default for non-string values', () => {
    assert.equal(normalizeStatus(null), 'open');
    assert.equal(normalizeStatus(undefined), 'open');
    assert.equal(normalizeStatus(123), 'open');
    assert.equal(normalizeStatus({}), 'open');
  });

  it('trims whitespace before matching', () => {
    assert.equal(normalizeStatus('  open  '), 'open');
    assert.equal(normalizeStatus('\tin-progress\n'), 'in-progress');
  });
});

describe('normalizePriority', () => {
  it('accepts canonical priority values', () => {
    for (const priority of ISSUE_PRIORITIES) {
      assert.equal(normalizePriority(priority), priority);
    }
  });

  it('falls back to default for unknown strings', () => {
    assert.equal(normalizePriority('extreme'), DEFAULT_PRIORITY);
    assert.equal(normalizePriority('urgent'), 'medium');
  });

  it('falls back to default for non-string values', () => {
    assert.equal(normalizePriority(null), 'medium');
    assert.equal(normalizePriority(undefined), 'medium');
    assert.equal(normalizePriority(42), 'medium');
  });

  it('lowercases mixed-case input', () => {
    assert.equal(normalizePriority('HIGH'), 'high');
    assert.equal(normalizePriority('Low'), 'low');
  });
});

describe('nextStatus', () => {
  it('cycles open → in-progress → closed → open', () => {
    assert.equal(nextStatus('open'), 'in-progress');
    assert.equal(nextStatus('in-progress'), 'closed');
    assert.equal(nextStatus('closed'), 'open');
  });
});

describe('ISSUE_STATUS_LABELS', () => {
  it('has a label for every status', () => {
    for (const status of ISSUE_STATUSES) {
      assert.ok(ISSUE_STATUS_LABELS[status]);
    }
  });
});
