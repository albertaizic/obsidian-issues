import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilenamePattern, getNextIssueId, normalizePrefix, shortIssueId } from '../src/utils/issue-id.ts';

describe('buildFilenamePattern', () => {
  it('matches ISSUE-001 format', () => {
    const pattern = buildFilenamePattern('ISSUE');
    assert.ok(pattern.test('ISSUE-001'));
    assert.ok(pattern.test('ISSUE-010'));
    assert.ok(pattern.test('ISSUE-9999'));
    assert.ok(!pattern.test('ISSUE-'));
    assert.ok(!pattern.test('ISSUE-abc'));
    assert.ok(!pattern.test('TASK-001'));
  });

  it('matches custom prefixes', () => {
    assert.ok(buildFilenamePattern('TASK').test('TASK-001'));
    assert.ok(buildFilenamePattern('BUG').test('BUG-050'));
    assert.ok(buildFilenamePattern('WORK').test('WORK-123'));
  });

  it('is case-insensitive', () => {
    const pattern = buildFilenamePattern('ISSUE');
    assert.ok(pattern.test('issue-001'));
    assert.ok(pattern.test('Issue-001'));
  });

  it('rejects names without the prefix', () => {
    const pattern = buildFilenamePattern('ISSUE');
    assert.ok(!pattern.test('001'));
    assert.ok(!pattern.test('ISSUE001'));
    assert.ok(!pattern.test('ISSUE-001-extra'));
  });
});

describe('normalizePrefix', () => {
  it('uppercases lowercase input', () => {
    assert.equal(normalizePrefix('issue'), 'ISSUE');
  });

  it('replaces non-alphanumeric with underscores', () => {
    assert.equal(normalizePrefix('issue name'), 'ISSUE_NAME');
    assert.equal(normalizePrefix('issue-name'), 'ISSUE_NAME');
  });

  it('falls back to ISSUE for empty input', () => {
    assert.equal(normalizePrefix(''), 'ISSUE');
    assert.equal(normalizePrefix('   '), 'ISSUE');
  });

  it('falls back to ISSUE for dot-prefixed input', () => {
    assert.equal(normalizePrefix('.issue'), 'ISSUE');
    assert.equal(normalizePrefix('.Issues'), 'ISSUE');
  });

  it('preserves valid uppercase prefixes', () => {
    assert.equal(normalizePrefix('TASK'), 'TASK');
    assert.equal(normalizePrefix('BUG'), 'BUG');
  });
});

describe('shortIssueId', () => {
  it('extracts numeric portion as #N', () => {
    assert.equal(shortIssueId('ISSUE-001'), '#1');
    assert.equal(shortIssueId('ISSUE-010'), '#10');
    assert.equal(shortIssueId('ISSUE-999'), '#999');
  });

  it('works with any prefix', () => {
    assert.equal(shortIssueId('TASK-001'), '#1');
    assert.equal(shortIssueId('BUG-050'), '#50');
    assert.equal(shortIssueId('WORK-123'), '#123');
  });

  it('falls back to the raw ID for unrecognized formats', () => {
    assert.equal(shortIssueId('no-prefix'), 'no-prefix');
    assert.equal(shortIssueId('ISSUE-abc'), 'ISSUE-abc');
    assert.equal(shortIssueId(''), '');
  });
});

describe('getNextIssueId', () => {
  const mockFile = (basename: string, folder = 'Issues'): { basename: string; parent: { path: string } } => ({
    basename,
    parent: { path: folder },
  });

  it('returns PREFIX-001 when no files exist', () => {
    assert.equal(getNextIssueId([], 'ISSUE'), 'ISSUE-001');
    assert.equal(getNextIssueId([], 'TASK'), 'TASK-001');
  });

  it('increments from the highest existing number', () => {
    const files = [mockFile('ISSUE-001'), mockFile('ISSUE-002'), mockFile('ISSUE-005')];
    assert.equal(getNextIssueId(files, 'ISSUE'), 'ISSUE-006');
  });

  it('handles large numbers with padding', () => {
    const files = [mockFile('ISSUE-099')];
    assert.equal(getNextIssueId(files, 'ISSUE'), 'ISSUE-100');
  });

  it('ignores files that do not match the prefix pattern', () => {
    const files = [mockFile('TASK-001'), mockFile('ISSUE-003')];
    assert.equal(getNextIssueId(files, 'ISSUE'), 'ISSUE-004');
  });

  it('uses configurable prefix', () => {
    const files = [mockFile('TASK-001', 'Issues'), mockFile('TASK-002', 'Issues')];
    assert.equal(getNextIssueId(files, 'TASK'), 'TASK-003');
  });
});
