import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  normalizeFolder,
  normalizeSettings,
  validateFolder,
  validatePrefix,
  type IssuesSettings,
} from '../src/config/settings.ts';

describe('validateFolder', () => {
  it('accepts the default folder, leading space and all', () => {
    assert.equal(validateFolder(' Issues').valid, true);
  });

  it('accepts an ordinary name', () => {
    assert.equal(validateFolder('Tasks').valid, true);
  });

  it('rejects a dot-prefixed folder and explains why', () => {
    const result = validateFolder('.Issues');
    assert.equal(result.valid, false);
    assert.match(result.message ?? '', /hidden/i);
  });

  it('rejects an empty or whitespace-only folder', () => {
    assert.equal(validateFolder('').valid, false);
    assert.equal(validateFolder('   ').valid, false);
  });

  it('rejects path separators and other illegal characters', () => {
    assert.equal(validateFolder('Issues/Sub').valid, false);
    assert.equal(validateFolder('Issues:1').valid, false);
    assert.equal(validateFolder('Issues?').valid, false);
  });

  it('rejects a trailing dot', () => {
    assert.equal(validateFolder('Issues.').valid, false);
  });
});

describe('validatePrefix', () => {
  it('accepts ordinary prefixes', () => {
    assert.equal(validatePrefix('ISSUE').valid, true);
    assert.equal(validatePrefix('task').valid, true);
  });

  it('rejects empty, dot-prefixed and symbol-only values', () => {
    assert.equal(validatePrefix('').valid, false);
    assert.equal(validatePrefix('.TASK').valid, false);
    assert.equal(validatePrefix('---').valid, false);
  });
});

describe('normalizeFolder', () => {
  it('preserves the leading space of the default folder', () => {
    // Regression: trim() used to strip it, silently relocating every issue
    // from " Issues" to "Issues" the moment the settings tab was touched.
    assert.equal(normalizeFolder(' Issues'), ' Issues');
  });

  it('strips trailing whitespace only', () => {
    assert.equal(normalizeFolder(' Issues   '), ' Issues');
  });

  it('falls back to the default for invalid names', () => {
    assert.equal(normalizeFolder('.hidden'), DEFAULT_SETTINGS.issuesFolder);
    assert.equal(normalizeFolder('a/b'), DEFAULT_SETTINGS.issuesFolder);
    assert.equal(normalizeFolder(42), DEFAULT_SETTINGS.issuesFolder);
  });
});

describe('normalizeSettings', () => {
  it('returns defaults for null input', () => {
    const result = normalizeSettings(null);
    assert.equal(result.issuesFolder, DEFAULT_SETTINGS.issuesFolder);
    assert.equal(result.issuePrefix, DEFAULT_SETTINGS.issuePrefix);
    assert.equal(result.defaultPriority, DEFAULT_SETTINGS.defaultPriority);
    assert.equal(result.viewMode, DEFAULT_SETTINGS.viewMode);
    assert.equal(result.confirmDelete, DEFAULT_SETTINGS.confirmDelete);
    assert.equal(result.defaultSortBy, DEFAULT_SETTINGS.defaultSortBy);
    assert.equal(result.defaultSortDir, DEFAULT_SETTINGS.defaultSortDir);
  });

  it('returns defaults for empty object', () => {
    const result = normalizeSettings({});
    assert.equal(result.issuesFolder, ' Issues');
  });

  it('round-trips the default folder without losing its leading space', () => {
    const once = normalizeSettings({ issuesFolder: ' Issues' });
    const twice = normalizeSettings(once);
    assert.equal(once.issuesFolder, ' Issues');
    assert.equal(twice.issuesFolder, ' Issues');
  });

  it('preserves valid settings', () => {
    const result = normalizeSettings({
      issuesFolder: 'MyIssues',
      issuePrefix: 'TASK',
      defaultPriority: 'high',
      viewMode: 'kanban',
      confirmDelete: false,
      defaultSortBy: 'due',
      defaultSortDir: 'asc',
    });
    assert.equal(result.issuesFolder, 'MyIssues');
    assert.equal(result.issuePrefix, 'TASK');
    assert.equal(result.defaultPriority, 'high');
    assert.equal(result.viewMode, 'kanban');
    assert.equal(result.confirmDelete, false);
    assert.equal(result.defaultSortBy, 'due');
    assert.equal(result.defaultSortDir, 'asc');
  });

  it('rejects dot-prefixed folder and falls back to default', () => {
    const result = normalizeSettings({ issuesFolder: '.Issues' });
    assert.equal(result.issuesFolder, DEFAULT_SETTINGS.issuesFolder);
  });

  it('rejects whitespace-only folder and falls back to default', () => {
    const result = normalizeSettings({ issuesFolder: '   ' });
    assert.equal(result.issuesFolder, DEFAULT_SETTINGS.issuesFolder);
  });

  it('rejects empty folder and falls back to default', () => {
    const result = normalizeSettings({ issuesFolder: '' });
    assert.equal(result.issuesFolder, DEFAULT_SETTINGS.issuesFolder);
  });

  it('rejects non-string folder and falls back to default', () => {
    const result = normalizeSettings({ issuesFolder: 123 });
    assert.equal(result.issuesFolder, DEFAULT_SETTINGS.issuesFolder);
  });

  it('normalizes prefix to uppercase', () => {
    const result = normalizeSettings({ issuePrefix: 'task' });
    assert.equal(result.issuePrefix, 'TASK');
  });

  it('rejects invalid priority and falls back to medium', () => {
    const result = normalizeSettings({ defaultPriority: 'extreme' });
    assert.equal(result.defaultPriority, 'medium');
  });

  it('rejects invalid viewMode and falls back to list', () => {
    const result = normalizeSettings({ viewMode: 'grid' });
    assert.equal(result.viewMode, 'list');
  });

  it('rejects invalid sortBy and falls back to created', () => {
    const result = normalizeSettings({ defaultSortBy: 'unknown' });
    assert.equal(result.defaultSortBy, 'created');
  });

  it('rejects invalid sortDir and falls back to desc', () => {
    const result = normalizeSettings({ defaultSortDir: 'sideways' });
    assert.equal(result.defaultSortDir, 'desc');
  });

  it('confirms deletion by default when not specified', () => {
    const result = normalizeSettings({});
    assert.equal(result.confirmDelete, true);
  });

  it('disables delete confirmation when explicitly false', () => {
    const result = normalizeSettings({ confirmDelete: false });
    assert.equal(result.confirmDelete, false);
  });
});
