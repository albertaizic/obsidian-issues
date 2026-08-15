import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { statusMenuItems } from '../src/constants.ts';
import { ISSUE_STATUSES, ISSUE_STATUS_LABELS } from '../src/constants.ts';
import type { IssueStatus } from '../src/types.ts';

describe('statusMenuItems', () => {
  it('returns all 3 statuses', () => {
    const result = statusMenuItems('open');
    assert.equal(result.length, 3);
    assert.deepEqual(result.map((r) => r.value), ['open', 'in-progress', 'closed']);
  });

  it('checked is true only for the current status', () => {
    for (const status of ISSUE_STATUSES) {
      const result = statusMenuItems(status);
      const checked = result.filter((r) => r.checked);
      assert.equal(checked.length, 1);
      assert.equal(checked[0].value, status);
    }
  });

  it('labels match ISSUE_STATUS_LABELS', () => {
    const result = statusMenuItems('open');
    for (const option of result) {
      assert.equal(option.label, ISSUE_STATUS_LABELS[option.value as IssueStatus]);
    }
  });

  it('order matches ISSUE_STATUSES cycle order', () => {
    const result = statusMenuItems('closed');
    assert.deepEqual(
      result.map((r) => r.value),
      ['open', 'in-progress', 'closed'],
    );
  });
});
