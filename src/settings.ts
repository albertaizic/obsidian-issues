import { App, PluginSettingTab, Setting } from 'obsidian';
import type { Plugin } from 'obsidian';
import type { IssuePriority } from './types';
import {
  DEFAULT_ISSUE_PREFIX,
  DEFAULT_ISSUES_FOLDER,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
} from './constants';

export type IssueViewMode = 'list' | 'kanban';

export interface IssuesSettings {
  issuesFolder: string;
  issuePrefix: string;
  defaultPriority: IssuePriority;
  /** Persisted across restarts — previously this lived in sessionStorage. */
  viewMode: IssueViewMode;
  confirmDelete: boolean;
  defaultSortBy: 'created' | 'due' | 'priority';
  defaultSortDir: 'asc' | 'desc';
}

export const DEFAULT_SETTINGS: IssuesSettings = {
  issuesFolder: DEFAULT_ISSUES_FOLDER,
  issuePrefix: DEFAULT_ISSUE_PREFIX,
  defaultPriority: 'medium',
  viewMode: 'list',
  confirmDelete: true,
  defaultSortBy: 'created',
  defaultSortDir: 'desc',
};

/**
 * The subset of the plugin the issues view needs. Declared here rather than
 * importing the plugin class so `issues-view.ts` and `main.ts` don't form an
 * import cycle.
 */
export interface IssuesViewHost {
  settings: IssuesSettings;
  saveSettings(): Promise<void>;
}

/**
 * Coerces a user-entered folder name: trims whitespace, rejects dot-prefixed
 * names (Obsidian's Vault API silently ignores folders starting with "."),
 * and falls back to the default.
 */
function normalizeFolder(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ISSUES_FOLDER;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('.')) return DEFAULT_ISSUES_FOLDER;
  return trimmed;
}

function normalizePrefix(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ISSUE_PREFIX;
  const trimmed = value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  if (trimmed.length === 0 || trimmed.startsWith('.')) return DEFAULT_ISSUE_PREFIX;
  return trimmed;
}

export function normalizeSettings(raw: unknown): IssuesSettings {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<IssuesSettings>;
  return {
    issuesFolder: normalizeFolder(data.issuesFolder),
    issuePrefix: normalizePrefix(data.issuePrefix),
    defaultPriority: ISSUE_PRIORITIES.includes(data.defaultPriority as IssuePriority)
      ? (data.defaultPriority as IssuePriority)
      : 'medium',
    viewMode: data.viewMode === 'kanban' ? 'kanban' : 'list',
    confirmDelete: data.confirmDelete !== false,
    defaultSortBy:
      data.defaultSortBy === 'due' || data.defaultSortBy === 'priority'
        ? data.defaultSortBy
        : 'created',
    defaultSortDir: data.defaultSortDir === 'asc' ? 'asc' : 'desc',
  };
}

export class IssuesSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: IssuesViewHost,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Issues folder')
      .setDesc('Folder where issue notes are stored. Changing this requires a reload.')
      .addText((input) => {
        input
          .setValue(this.host.settings.issuesFolder)
          .setPlaceholder('Issues')
          .onChange(async (value) => {
            const trimmed = value.trim();
            this.host.settings.issuesFolder =
              trimmed.length > 0 && !trimmed.startsWith('.') ? trimmed : DEFAULT_ISSUES_FOLDER;
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Issue ID prefix')
      .setDesc('Prefix for issue filenames, e.g. "issue" produces issue-001')
      .addText((input) => {
        input
          .setValue(this.host.settings.issuePrefix)
          .setPlaceholder('ISSUE')
          .onChange(async (value) => {
            const trimmed = value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
            this.host.settings.issuePrefix =
              trimmed.length > 0 && !trimmed.startsWith('.') ? trimmed : DEFAULT_ISSUE_PREFIX;
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default priority')
      .setDesc('Priority applied to new issues.')
      .addDropdown((dropdown) => {
        for (const priority of ISSUE_PRIORITIES) {
          dropdown.addOption(priority, ISSUE_PRIORITY_LABELS[priority]);
        }
        dropdown
          .setValue(this.host.settings.defaultPriority)
          .onChange(async (value) => {
            this.host.settings.defaultPriority = ISSUE_PRIORITIES.includes(
              value as IssuePriority,
            )
              ? (value as IssuePriority)
              : 'medium';
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default view')
      .setDesc('Which layout the issues view opens in.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('list', 'List')
          .addOption('kanban', 'Kanban')
          .setValue(this.host.settings.viewMode)
          .onChange(async (value) => {
            this.host.settings.viewMode = value === 'kanban' ? 'kanban' : 'list';
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Confirm before deleting')
      .setDesc('Ask for confirmation before moving an issue to the trash.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.host.settings.confirmDelete)
          .onChange(async (value) => {
            this.host.settings.confirmDelete = value;
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default sort')
      .setDesc('Sort order applied when the issues view is first opened.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('created-desc', 'Created (newest first)')
          .addOption('created-asc', 'Created (oldest first)')
          .addOption('due-asc', 'Due date (soonest first)')
          .addOption('due-desc', 'Due date (latest first)')
          .addOption('priority-desc', 'Priority (highest first)')
          .addOption('priority-asc', 'Priority (lowest first)')
          .setValue(`${this.host.settings.defaultSortBy}-${this.host.settings.defaultSortDir}`)
          .onChange(async (value) => {
            const [sortBy, sortDir] = value.split('-');
            this.host.settings.defaultSortBy =
              sortBy === 'due' || sortBy === 'priority' ? sortBy : 'created';
            this.host.settings.defaultSortDir = sortDir === 'asc' ? 'asc' : 'desc';
            await this.host.saveSettings();
          });
      });
  }
}
