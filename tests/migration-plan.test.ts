import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planFolderMove,
  planPrefixRename,
  type PlannableFile,
} from '../src/utils/migration.ts';

const FOLDER = ' Issues';

function file(basename: string, parentPath = FOLDER): PlannableFile {
  return { basename, name: `${basename}.md`, parentPath };
}

describe('planFolderMove', () => {
  it('moves issue notes into the new folder, keeping their filenames', () => {
    const plan = planFolderMove([file('ISSUE-001'), file('ISSUE-002')], FOLDER, 'Tasks', 'ISSUE');
    assert.equal(plan.operations.length, 2);
    assert.deepEqual(
      plan.operations.map((o) => o.targetPath),
      ['Tasks/ISSUE-001.md', 'Tasks/ISSUE-002.md'],
    );
    assert.equal(plan.skipped.length, 0);
  });

  it('preserves the leading space of the default folder', () => {
    const plan = planFolderMove([file('ISSUE-001', 'Tasks')], 'Tasks', ' Issues', 'ISSUE');
    assert.equal(plan.operations[0].targetPath, ' Issues/ISSUE-001.md');
  });

  it('ignores files outside the source folder', () => {
    const plan = planFolderMove(
      [file('ISSUE-001'), file('ISSUE-002', 'Elsewhere')],
      FOLDER,
      'Tasks',
      'ISSUE',
    );
    assert.equal(plan.operations.length, 1);
    assert.equal(plan.operations[0].file.basename, 'ISSUE-001');
  });

  it('leaves notes that are not issues alone', () => {
    const plan = planFolderMove(
      [file('ISSUE-001'), file('My personal note'), file('TASK-009')],
      FOLDER,
      'Tasks',
      'ISSUE',
    );
    assert.deepEqual(plan.operations.map((o) => o.file.basename), ['ISSUE-001']);
  });

  it('skips a file whose destination is already occupied', () => {
    const plan = planFolderMove(
      [file('ISSUE-001'), file('ISSUE-002')],
      FOLDER,
      'Tasks',
      'ISSUE',
      new Set(['Tasks/ISSUE-001.md']),
    );
    assert.deepEqual(plan.operations.map((o) => o.file.basename), ['ISSUE-002']);
    assert.deepEqual(plan.skipped.map((f) => f.basename), ['ISSUE-001']);
  });

  it('is a no-op when the folder is unchanged', () => {
    const plan = planFolderMove([file('ISSUE-001')], FOLDER, FOLDER, 'ISSUE');
    assert.equal(plan.operations.length, 0);
    assert.equal(plan.skipped.length, 0);
  });

  it('matches on the prefix it is given, not the stored one', () => {
    // After a combined rename+move the files already carry the new prefix.
    const plan = planFolderMove([file('TASK-001')], FOLDER, 'Tasks', 'TASK');
    assert.equal(plan.operations.length, 1);
  });
});

describe('planPrefixRename', () => {
  it('renames the prefix while preserving the number and padding', () => {
    const plan = planPrefixRename([file('ISSUE-007')], FOLDER, 'ISSUE', 'TASK');
    assert.equal(plan.operations[0].oldId, 'ISSUE-007');
    assert.equal(plan.operations[0].newId, 'TASK-007');
    assert.equal(plan.operations[0].targetPath, ' Issues/TASK-007.md');
  });

  it('renames every matching issue', () => {
    const plan = planPrefixRename(
      [file('ISSUE-001'), file('ISSUE-002'), file('ISSUE-050')],
      FOLDER,
      'ISSUE',
      'BUG',
    );
    assert.deepEqual(plan.operations.map((o) => o.newId), ['BUG-001', 'BUG-002', 'BUG-050']);
  });

  it('ignores files that do not match the old prefix', () => {
    const plan = planPrefixRename(
      [file('ISSUE-001'), file('NOTE-001'), file('readme')],
      FOLDER,
      'ISSUE',
      'TASK',
    );
    assert.equal(plan.operations.length, 1);
  });

  it('skips a rename that would overwrite an existing file', () => {
    const plan = planPrefixRename(
      [file('ISSUE-001')],
      FOLDER,
      'ISSUE',
      'TASK',
      new Set([' Issues/TASK-001.md']),
    );
    assert.equal(plan.operations.length, 0);
    assert.deepEqual(plan.skipped.map((f) => f.basename), ['ISSUE-001']);
  });

  it('never schedules two files onto the same destination', () => {
    // Case differences collapse under the case-insensitive pattern.
    const plan = planPrefixRename(
      [file('ISSUE-001'), file('issue-001')],
      FOLDER,
      'ISSUE',
      'TASK',
    );
    assert.equal(plan.operations.length, 1);
    assert.equal(plan.skipped.length, 1);
  });

  it('is a no-op when the prefix is unchanged', () => {
    const plan = planPrefixRename([file('ISSUE-001')], FOLDER, 'ISSUE', 'ISSUE');
    assert.equal(plan.operations.length, 0);
  });

  it('ignores files outside the issues folder', () => {
    const plan = planPrefixRename(
      [file('ISSUE-001', 'Elsewhere')],
      FOLDER,
      'ISSUE',
      'TASK',
    );
    assert.equal(plan.operations.length, 0);
  });
});
