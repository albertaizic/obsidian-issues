import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings, type IssuesSettings } from '../src/config/settings.ts';

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
