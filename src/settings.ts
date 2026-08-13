import { App, PluginSettingTab, Setting } from 'obsidian';
import type { Plugin } from 'obsidian';

export type IssueViewMode = 'list' | 'kanban';

export interface IssuesSettings {
  /** Persisted across restarts — previously this lived in sessionStorage. */
  viewMode: IssueViewMode;
  confirmDelete: boolean;
  defaultSortBy: 'created' | 'due' | 'priority';
  defaultSortDir: 'asc' | 'desc';
}

export const DEFAULT_SETTINGS: IssuesSettings = {
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

export function normalizeSettings(raw: unknown): IssuesSettings {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<IssuesSettings>;
  return {
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
