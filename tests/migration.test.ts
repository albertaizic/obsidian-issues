import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextIssueId,
  issueFilesInFolder,
} from '../src/utils/issue-id.ts';

function mockFile(basename: string, folderPath: string) {
  return { basename, parent: { path: folderPath } };
}

const ISSUE_FOLDER = ' Issues';

describe('issueFilesInFolder', () => {
  it('filters out files not matching the prefix pattern', () => {
    const files = [
      mockFile('ISSUE-001', ISSUE_FOLDER),
      mockFile('TASK-001', ISSUE_FOLDER),
      mockFile('ISSUE-002', ISSUE_FOLDER),
    ];
    const result = issueFilesInFolder(files as any, ISSUE_FOLDER, 'ISSUE');
    assert.equal(result.length, 2);
    assert.ok(result.every((f) => f.basename.startsWith('ISSUE-')));
  });

  it('returns only files in the specified folder', () => {
    const files = [
      mockFile('ISSUE-001', ISSUE_FOLDER),
      mockFile('ISSUE-002', 'Other Folder'),
      mockFile('ISSUE-003', ISSUE_FOLDER),
    ];
    const result = issueFilesInFolder(files as any, ISSUE_FOLDER, 'ISSUE');
    assert.equal(result.length, 2);
    assert.equal(result[0].basename, 'ISSUE-001');
    assert.equal(result[1].basename, 'ISSUE-003');
  });

  it('returns empty array when no files match', () => {
    const files = [
      mockFile('TASK-001', ISSUE_FOLDER),
      mockFile('random.md', ISSUE_FOLDER),
    ];
    const result = issueFilesInFolder(files as any, ISSUE_FOLDER, 'ISSUE');
    assert.equal(result.length, 0);
  });

  it('is case-insensitive on prefix', () => {
    const files = [
      mockFile('issue-001', ISSUE_FOLDER),
      mockFile('Issue-002', ISSUE_FOLDER),
      mockFile('ISSUE-003', ISSUE_FOLDER),
    ];
    const result = issueFilesInFolder(files as any, ISSUE_FOLDER, 'ISSUE');
    assert.equal(result.length, 3);
  });
});

describe('getNextIssueId with mixed-prefix sets', () => {
  it('ignores files with a different prefix', () => {
    const files = [
      mockFile('TASK-001', ISSUE_FOLDER),
      mockFile('ISSUE-003', ISSUE_FOLDER),
    ];
    assert.equal(getNextIssueId(files as any, 'ISSUE'), 'ISSUE-004');
  });

  it('handles non-contiguous numbering with correct padding', () => {
    const files = [
      mockFile('ISSUE-001', ISSUE_FOLDER),
      mockFile('ISSUE-005', ISSUE_FOLDER),
      mockFile('ISSUE-012', ISSUE_FOLDER),
    ];
    assert.equal(getNextIssueId(files as any, 'ISSUE'), 'ISSUE-013');
  });

  it('returns PREFIX-001 for empty file list', () => {
    assert.equal(getNextIssueId([], 'ISSUE'), 'ISSUE-001');
    assert.equal(getNextIssueId([], 'TASK'), 'TASK-001');
  });

  it('returns PREFIX-001 when all files have the wrong prefix', () => {
    const files = [mockFile('TASK-001', ISSUE_FOLDER), mockFile('TASK-002', ISSUE_FOLDER)];
    assert.equal(getNextIssueId(files as any, 'ISSUE'), 'ISSUE-001');
  });
});
