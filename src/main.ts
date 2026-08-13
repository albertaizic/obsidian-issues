import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { VIEW_TYPE_ISSUES } from './constants';
import { IssueModal } from './issue-modal';
import { IssueService } from './issue-service';
import { IssuesView } from './issues-view';
import {
  DEFAULT_SETTINGS,
  IssuesSettingTab,
  normalizeSettings,
  type IssuesSettings,
  type IssuesViewHost,
} from './settings';
import type { IssueData } from './types';

export default class ObsidianIssuesPlugin extends Plugin implements IssuesViewHost {
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
        if (!checking) void this.createIssueForCurrentNote(activeFile);
        return true;
      },
    });

    this.addCommand({
      id: 'toggle-issues-layout',
      name: 'Toggle list / Kanban layout',
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
          await this.issueService.clearSourceForDeletedNote(file.path);
          this.issueService.invalidate();
          await this.reloadOpenIssueViews();
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
          await this.issueService.updateSourcePath(oldPath, file.path);
          this.issueService.invalidate();
          await this.reloadOpenIssueViews();
        })();
      }),
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
      console.error('Obsidian Issues: failed to prepare new issue', error);
      new Notice('Could not create issue. Check the developer console.');
    }
  }
}
