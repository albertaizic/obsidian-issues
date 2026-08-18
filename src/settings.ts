import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { Plugin } from 'obsidian';
import type { IssuePriority } from './types.ts';
import type { IssuesSettings, IssuesViewHost } from './config/settings.ts';
import { validateFolder, validatePrefix } from './config/settings.ts';
import {
  DEFAULT_ISSUES_FOLDER,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
} from './constants.ts';

export {
  DEFAULT_SETTINGS,
  normalizeSettings,
  validateFolder,
  validatePrefix,
} from './config/settings.ts';
export type { IssueViewMode, IssuesSettings, IssuesViewHost } from './config/settings.ts';

/**
 * Settings are edited as a **draft** and only written on Apply.
 *
 * The folder name and ID prefix decide where issues live on disk, so applying
 * them as the user types would move files mid-keystroke — typing "Tasks" would
 * migrate through "T", "Ta", "Tas"... Staging the edits also makes Cancel
 * meaningful and gives validation somewhere to block on.
 */
export class IssuesSettingTab extends PluginSettingTab {
  private readonly host: IssuesViewHost;
  private draft!: IssuesSettings;
  private applyButton: HTMLButtonElement | null = null;
  private cancelButton: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private folderErrorEl: HTMLElement | null = null;
  private prefixErrorEl: HTMLElement | null = null;
  private applying = false;

  constructor(app: App, plugin: Plugin, host: IssuesViewHost) {
    super(app, plugin);
    this.host = host;
  }

  // The declarative settings API (Obsidian 1.13+) doesn't support our
  // draft/apply workflow with custom validation. Return empty to satisfy
  // the API while keeping our imperative implementation.
  getSettingDefinitions(): never[] {
    return [];
  }

  display(): void {
    this.draft = { ...this.host.settings };
    this.render();
  }

  hide(): void {
    // Leaving the tab with unsaved edits discards them; nothing was written.
    this.draft = { ...this.host.settings };
  }

  private render(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('obsidian-issues-settings');

    this.renderStorageSection(containerEl);
    this.renderDefaultsSection(containerEl);
    this.renderActions(containerEl);
    this.refreshState();
  }

  // -- storage -------------------------------------------------------------

  private renderStorageSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Storage').setHeading();

    const folderSetting = new Setting(containerEl)
      .setName('Issues folder')
      .setDesc(
        `Folder where issue notes are stored. The default "${DEFAULT_ISSUES_FOLDER}" starts with a ` +
          'space so it sorts to the top of the file list. Renaming it moves your existing issues.',
      )
      .addText((input) => {
        input
          .setPlaceholder(DEFAULT_ISSUES_FOLDER)
          .setValue(this.draft.issuesFolder)
          .onChange((value) => {
            // Deliberately not trimmed: the leading space is part of the name.
            this.draft.issuesFolder = value.replace(/\s+$/, '');
            this.refreshState();
          });
        input.inputEl.addClass('obsidian-issues-settings-input');
      });

    this.folderErrorEl = folderSetting.controlEl.createDiv({
      cls: 'obsidian-issues-settings-error',
    });

    const prefixSetting = new Setting(containerEl)
      .setName('Issue ID prefix')
      .setDesc('Prefix for issue filenames, e.g. "task" produces task-001. Changing this renames existing issues.')
      .addText((input) => {
        input
          .setPlaceholder('ISSUE')
          .setValue(this.draft.issuePrefix)
          .onChange((value) => {
            this.draft.issuePrefix = value.trim();
            this.refreshState();
          });
        input.inputEl.addClass('obsidian-issues-settings-input');
      });

    this.prefixErrorEl = prefixSetting.controlEl.createDiv({
      cls: 'obsidian-issues-settings-error',
    });
  }

  // -- defaults ------------------------------------------------------------

  private renderDefaultsSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Defaults').setHeading();

    new Setting(containerEl)
      .setName('Default view')
      .setDesc('Layout the issues view opens in. Applying reopens the view in this layout.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('list', 'List')
          .addOption('kanban', 'Kanban')
          .setValue(this.draft.viewMode)
          .onChange((value) => {
            this.draft.viewMode = value === 'kanban' ? 'kanban' : 'list';
            this.refreshState();
          });
      });

    new Setting(containerEl)
      .setName('Default priority')
      .setDesc('Priority applied to new issues.')
      .addDropdown((dropdown) => {
        for (const priority of ISSUE_PRIORITIES) {
          dropdown.addOption(priority, ISSUE_PRIORITY_LABELS[priority]);
        }
        dropdown.setValue(this.draft.defaultPriority).onChange((value) => {
          this.draft.defaultPriority = ISSUE_PRIORITIES.includes(value as IssuePriority)
            ? (value as IssuePriority)
            : 'medium';
          this.refreshState();
        });
      });

    new Setting(containerEl)
      .setName('Default sort')
      .setDesc('Sort order applied when the issues view is opened.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('created-desc', 'Created (newest first)')
          .addOption('created-asc', 'Created (oldest first)')
          .addOption('due-asc', 'Due date (soonest first)')
          .addOption('due-desc', 'Due date (latest first)')
          .addOption('priority-desc', 'Priority (highest first)')
          .addOption('priority-asc', 'Priority (lowest first)')
          .setValue(`${this.draft.defaultSortBy}-${this.draft.defaultSortDir}`)
          .onChange((value) => {
            const [sortBy, sortDir] = value.split('-');
            this.draft.defaultSortBy =
              sortBy === 'due' || sortBy === 'priority' ? sortBy : 'created';
            this.draft.defaultSortDir = sortDir === 'asc' ? 'asc' : 'desc';
            this.refreshState();
          });
      });

    new Setting(containerEl)
      .setName('Confirm before deleting')
      .setDesc('Ask for confirmation before moving an issue to the trash.')
      .addToggle((toggle) => {
        toggle.setValue(this.draft.confirmDelete).onChange((value) => {
          this.draft.confirmDelete = value;
          this.refreshState();
        });
      });
  }

  // -- actions -------------------------------------------------------------

  private renderActions(containerEl: HTMLElement): void {
    const actions = containerEl.createDiv({ cls: 'obsidian-issues-settings-actions' });

    this.statusEl = actions.createDiv({
      cls: 'obsidian-issues-settings-status',
      attr: { role: 'status', 'aria-live': 'polite' },
    });

    const buttons = actions.createDiv({ cls: 'obsidian-issues-settings-buttons' });

    this.cancelButton = buttons.createEl('button', {
      text: 'Cancel',
      type: 'button',
    });
    this.cancelButton.addEventListener('click', () => {
      this.draft = { ...this.host.settings };
      this.render();
      new Notice('Changes discarded');
    });

    this.applyButton = buttons.createEl('button', {
      text: 'Apply changes',
      cls: 'mod-cta',
      type: 'button',
    });
    this.applyButton.addEventListener('click', () => {
      void this.apply();
    });
  }

  /** Recomputes validation, the dirty flag and the button states. */
  private refreshState(): void {
    const folder = validateFolder(this.draft.issuesFolder);
    const prefix = validatePrefix(this.draft.issuePrefix);

    setError(this.folderErrorEl, folder.message);
    setError(this.prefixErrorEl, prefix.message);

    const valid = folder.valid && prefix.valid;
    const dirty = this.isDirty();

    if (this.applyButton) {
      this.applyButton.disabled = this.applying || !valid || !dirty;
    }
    if (this.cancelButton) {
      this.cancelButton.disabled = this.applying || !dirty;
    }

    if (this.statusEl) {
      this.statusEl.empty();
      this.statusEl.removeClass('is-error');
      this.statusEl.removeClass('is-dirty');

      if (!valid) {
        this.statusEl.addClass('is-error');
        this.statusEl.setText('Fix the highlighted problem before applying.');
      } else if (this.applying) {
        this.statusEl.setText('Applying…');
      } else if (dirty) {
        this.statusEl.addClass('is-dirty');
        this.statusEl.setText(this.describePendingChanges());
      } else {
        this.statusEl.setText('All changes applied.');
      }
    }
  }

  private isDirty(): boolean {
    const current = this.host.settings;
    return (
      current.issuesFolder !== this.draft.issuesFolder ||
      current.issuePrefix !== this.draft.issuePrefix.toUpperCase().replace(/[^A-Z0-9_]+/g, '_') ||
      current.defaultPriority !== this.draft.defaultPriority ||
      current.viewMode !== this.draft.viewMode ||
      current.confirmDelete !== this.draft.confirmDelete ||
      current.defaultSortBy !== this.draft.defaultSortBy ||
      current.defaultSortDir !== this.draft.defaultSortDir
    );
  }

  private describePendingChanges(): string {
    const current = this.host.settings;
    const parts: string[] = [];

    if (current.issuesFolder !== this.draft.issuesFolder) {
      parts.push(`move issues to "${this.draft.issuesFolder}"`);
    }
    if (
      current.issuePrefix !==
      this.draft.issuePrefix.toUpperCase().replace(/[^A-Z0-9_]+/g, '_')
    ) {
      parts.push(`rename issues to the ${this.draft.issuePrefix.toUpperCase()} prefix`);
    }

    return parts.length > 0
      ? `Unapplied changes — Apply will ${parts.join(' and ')}, then reset the issues view.`
      : 'Unapplied changes.';
  }

  private async apply(): Promise<void> {
    if (this.applying) return;

    const folder = validateFolder(this.draft.issuesFolder);
    const prefix = validatePrefix(this.draft.issuePrefix);
    if (!folder.valid || !prefix.valid) {
      new Notice(folder.message ?? prefix.message ?? 'Settings are not valid.');
      return;
    }

    this.applying = true;
    this.refreshState();

    try {
      const summary = await this.host.applySettings({ ...this.draft });
      new Notice(summary.length > 0 ? summary.join('\n') : 'Settings applied');
    } catch (error) {
      console.error('Vault Issues: failed to apply settings', error);
      new Notice('Could not apply settings. Check the developer console.');
    } finally {
      this.applying = false;
      // Re-read from the host: applySettings normalises the values it stored.
      this.draft = { ...this.host.settings };
      this.render();
    }
  }
}

function setError(el: HTMLElement | null, message: string | undefined): void {
  if (!el) return;
  el.empty();
  el.toggleClass('is-visible', message !== undefined);
  if (message !== undefined) {
    el.setText(message);
  }
}
