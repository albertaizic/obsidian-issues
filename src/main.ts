import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { VIEW_TYPE_ISSUES } from './constants.ts';
import { IssueModal } from './issue-modal.ts';
import { IssueService } from './issue-service.ts';
import { IssuesView } from './views/issues-view.ts';
import {
  DEFAULT_SETTINGS,
  IssuesSettingTab,
  normalizeSettings,
  type IssuesSettings,
  type IssuesViewHost,
} from './settings.ts';
import type { IssueData } from './types.ts';

export default class VaultIssuesPlugin extends Plugin implements IssuesViewHost {
  settings: IssuesSettings = { ...DEFAULT_SETTINGS };
  private issueService!: IssueService;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());

    this.issueService = new IssueService(this.app, this.settings);
    await this.issueService.migrateIssuesFolder();

    this.registerView(
      VIEW_TYPE_ISSUES,
      (leaf) => new IssuesView(leaf, this.issueService, this),
    );

    this.addSettingTab(new IssuesSettingTab(this.app, this, this));

    this.addCommand({
      id: 'open-issues',
      name: 'Open issues',
      callback: () => {
        void this.activateIssuesView();
      },
    });

    this.addCommand({
      id: 'create-issue',
      name: 'Create issue',
      callback: () => {
        void this.createIssue({});
      },
    });

    this.addCommand({
      id: 'create-issue-for-current-note',
      name: 'Create issue for current note',
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile === null) return false;
        // Disable when the active file is already an issue file
        if (this.isIssuesPath(activeFile.path)) return false;
        if (!checking) void this.createIssueForCurrentNote(activeFile);
        return true;
      },
    });

    this.addCommand({
      id: 'toggle-issues-layout',
      name: 'Toggle list / kanban layout',
      callback: () => {
        void this.toggleLayout();
      },
    });

    this.addRibbonIcon('circle-dot', 'Open issues', () => {
      void this.activateIssuesView();
    });

    const handleIssuePathChange = (path: string): void => {
      if (this.isIssuesPath(path)) {
        this.issueService.invalidate();
        void this.reloadOpenIssueViews();
      }
    };

    this.registerEvent(
      this.app.vault.on('create', (file) => handleIssuePathChange(file.path)),
    );

    this.registerEvent(
      this.app.vault.on('modify', (file) => handleIssuePathChange(file.path)),
    );

    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (this.isIssuesPath(file.path)) {
          handleIssuePathChange(file.path);
          return;
        }
        // A source note was deleted: clear the dangling `source` from any
        // issue pointing at it, then repaint so the stale link disappears.
        void (async () => {
          try {
            await this.issueService.clearSourceForDeletedNote(file.path);
            this.issueService.invalidate();
            await this.reloadOpenIssueViews();
          } catch (error) {
            console.error('Vault Issues: failed to clear source for deleted note', error);
          }
        })();
      }),
    );

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (this.isIssuesPath(file.path) || this.isIssuesPath(oldPath)) {
          handleIssuePathChange(file.path);
          return;
        }
        void (async () => {
          try {
            await this.issueService.updateSourcePath(oldPath, file.path);
            this.issueService.invalidate();
            await this.reloadOpenIssueViews();
          } catch (error) {
            console.error('Vault Issues: failed to update source path after rename', error);
          }
        })();
      }),
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Commits a staged settings draft.
   *
   * Order matters: the file migrations run while `this.settings` still points
   * at the *old* folder and prefix, because that is how `IssueService` locates
   * the files it needs to move. Only once they are on disk in their new home
   * is the settings object updated.
   */
  async applySettings(next: IssuesSettings): Promise<string[]> {
    const normalized = normalizeSettings(next);
    const previous = { ...this.settings };
    const summary: string[] = [];

    const prefixChanged = previous.issuePrefix !== normalized.issuePrefix;
    const folderChanged =
      normalizePath(previous.issuesFolder) !== normalizePath(normalized.issuesFolder);

    // Rename first, while the files are still in the folder the service knows
    // about; then move the renamed files to the new folder.
    if (prefixChanged) {
      const { renamed, skipped } = await this.issueService.renameIssuePrefix(
        previous.issuePrefix,
        normalized.issuePrefix,
      );
      if (renamed > 0) {
        summary.push(`Renamed ${renamed} issue${renamed === 1 ? '' : 's'} to ${normalized.issuePrefix}-…`);
      }
      if (skipped > 0) {
        summary.push(`${skipped} issue${skipped === 1 ? '' : 's'} skipped — a file with that name already exists.`);
      }
    }

    if (folderChanged) {
      // Match on the new prefix: if the rename above ran, that is what the
      // files in the old folder are already called.
      const { moved, skipped, oldFolderRemoved } = await this.issueService.moveIssuesFolder(
        previous.issuesFolder,
        normalized.issuesFolder,
        normalized.issuePrefix,
      );
      if (moved > 0) {
        summary.push(`Moved ${moved} issue${moved === 1 ? '' : 's'} to "${normalized.issuesFolder}"`);
      }
      if (skipped > 0) {
        summary.push(`${skipped} issue${skipped === 1 ? '' : 's'} skipped — a file with that name already exists at the destination.`);
      }
      if (oldFolderRemoved) {
        summary.push(`Removed the empty folder "${previous.issuesFolder}"`);
      } else if (moved > 0) {
        summary.push(`Kept "${previous.issuesFolder}" — it still contains other files.`);
      }
    }

    // Mutated in place rather than reassigned: `IssueService` and every open
    // view hold a reference to this exact object, so replacing it would leave
    // them reading the old configuration.
    Object.assign(this.settings, normalized);
    await this.saveSettings();

    this.issueService.invalidate();
    await this.issueService.ensureIssuesFolder();
    await this.resetIssueViews();

    if (summary.length === 0) summary.push('Settings applied');
    return summary;
  }

  /**
   * Closes every open issues view and opens a fresh one, so the layout, filters
   * and search box all start from the newly applied defaults rather than
   * carrying over state that referred to the old folder.
   */
  private async resetIssueViews(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_ISSUES);
    const wasOpen = leaves.length > 0;

    for (const leaf of leaves) {
      leaf.detach();
    }

    if (wasOpen) {
      await this.activateIssuesView();
    }
  }

  private async toggleLayout(): Promise<void> {
    this.settings.viewMode = this.settings.viewMode === 'kanban' ? 'list' : 'kanban';
    await this.saveSettings();
    await this.activateIssuesView();

    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ISSUES);
    await Promise.all(
      leaves.map(async (leaf) => {
        await leaf.loadIfDeferred();
        if (leaf.view instanceof IssuesView) {
          leaf.view.applyLayoutFromSettings();
        }
      }),
    );
  }

  /**
   * Uses the long-standing right-leaf API rather than `ensureSideLeaf`, which
   * is newer than the `minAppVersion` declared in the manifest.
   */
  private async activateIssuesView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_ISSUES)[0];
    if (leaf === undefined) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf === null) {
        new Notice('Could not open the issues sidebar.');
        return;
      }
      leaf = rightLeaf;
      await leaf.setViewState({ type: VIEW_TYPE_ISSUES, active: true });
    }

    await workspace.revealLeaf(leaf);
  }

  private async reloadOpenIssueViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ISSUES);

    await Promise.all(
      leaves.map(async (leaf) => {
        await leaf.loadIfDeferred();

        if (leaf.view instanceof IssuesView) {
          await leaf.view.reload();
        }
      }),
    );
  }

  private isIssuesPath(path: string): boolean {
    const folder = normalizePath(this.settings.issuesFolder);
    return path === folder || path.startsWith(`${folder}/`);
  }

  private async createIssueForCurrentNote(activeFile: TFile): Promise<void> {
    const noteIssueCount = await this.issueService.countIssuesForNote(activeFile.path);

    await this.createIssue(
      {
        title: `${activeFile.basename} #${noteIssueCount + 1}`,
        project: activeFile.basename,
        source: activeFile.path,
      },
      activeFile,
    );
  }

  private async createIssue(
    initial: Partial<IssueData>,
    linkTo?: TFile,
  ): Promise<void> {
    try {
      const [knownLabels, knownProjects] = await Promise.all([
        this.issueService.getAllLabels(),
        this.issueService.getAllProjects(),
      ]);

      new IssueModal(this.app, {
        title: 'New issue',
        initial,
        knownLabels,
        knownProjects,
        statusEditable: false,
        submitLabel: 'Create',
        // Errors thrown here are caught by the modal, which reports them and
        // leaves the form open rather than losing the user's input.
        onSubmit: async (data) => {
          const file = await this.issueService.createIssue(data);
          if (linkTo) {
            await this.issueService.linkIssueToNote(linkTo.path, file.basename);
          }
          await this.app.workspace.getLeaf(false).openFile(file);
          new Notice(`Created ${file.basename}`);
        },
      }).open();
    } catch (error) {
      console.error('Vault Issues: failed to prepare new issue', error);
      new Notice('Could not create issue. Check the developer console.');
    }
  }
}
