import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRIORITY, DEFAULT_STATUS, normalizePriority, normalizeStatus } from '../src/constants.ts';
import { toIsoDate, isValidDate } from '../src/dates.ts';

/**
 * Tests that simulate what happens when a user hand-edits issue frontmatter
 * with malformed or unexpected values. The plugin must never crash — it
 * silently falls back to safe defaults.
 */

describe('frontmatter normalization', () => {
  describe('status field', () => {
    it('status: "banana" falls back to open', () => {
      assert.equal(normalizeStatus('banana'), DEFAULT_STATUS);
      assert.equal(normalizeStatus('banana'), 'open');
    });

    it('status: null falls back to open', () => {
      assert.equal(normalizeStatus(null), 'open');
    });

    it('status: undefined falls back to open', () => {
      assert.equal(normalizeStatus(undefined), 'open');
    });

    it('status: "Open" normalizes to "open"', () => {
      assert.equal(normalizeStatus('Open'), 'open');
    });

    it('status: "In Progress" normalizes to "in-progress"', () => {
      assert.equal(normalizeStatus('In Progress'), 'in-progress');
    });

    it('status: "COMPLETED" falls back to open (not a valid status)', () => {
      assert.equal(normalizeStatus('COMPLETED'), 'open');
    });
  });

  describe('priority field', () => {
    it('priority: "extreme" falls back to medium', () => {
      assert.equal(normalizePriority('extreme'), 'medium');
      assert.equal(normalizePriority('extreme'), DEFAULT_PRIORITY);
    });

    it('priority: null falls back to medium', () => {
      assert.equal(normalizePriority(null), 'medium');
    });

    it('priority: "High" normalizes to "high"', () => {
      assert.equal(normalizePriority('High'), 'high');
    });

    it('priority: "urgent" falls back to medium', () => {
      assert.equal(normalizePriority('urgent'), 'medium');
    });
  });

  describe('due date field', () => {
    it('due: "tomorrow maybe" is treated as invalid', () => {
      assert.equal(isValidDate('tomorrow maybe'), false);
      assert.equal(toIsoDate('tomorrow maybe'), '');
    });

    it('due: "" (empty) is treated as invalid', () => {
      assert.equal(isValidDate(''), false);
      assert.equal(toIsoDate(''), '');
    });

    it('due: "2026-08-15" (valid ISO) is accepted', () => {
      assert.equal(isValidDate('2026-08-15'), true);
      assert.equal(toIsoDate('2026-08-15'), '2026-08-15');
    });

    it('due: "15/08/2026" (valid DD/MM/YYYY) is accepted', () => {
      assert.equal(isValidDate('15/08/2026'), true);
    });

    it('due: "31/02/2026" (impossible date) is rejected', () => {
      assert.equal(isValidDate('31/02/2026'), false);
      assert.equal(toIsoDate('31/02/2026'), '');
    });
  });

  describe('missing fields', () => {
    it('missing status falls back to open', () => {
      assert.equal(normalizeStatus(undefined), 'open');
    });

    it('missing priority falls back to medium', () => {
      assert.equal(normalizePriority(undefined), 'medium');
    });

    it('missing due date falls back to empty', () => {
      assert.equal(toIsoDate(undefined as unknown as string), '');
    });
  });
});
