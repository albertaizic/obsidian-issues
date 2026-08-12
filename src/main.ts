import { Notice, Plugin } from 'obsidian';
import { ISSUES_FOLDER, VIEW_TYPE_ISSUES } from './constants';
import { IssueModal } from './issue-modal';
import { IssueService } from './issue-service';
import { IssuesView } from './issues-view';

export default class ObsidianIssuesPlugin extends Plugin {
  private issueService!: IssueService;

  async onload(): Promise<void> {
    this.issueService = new IssueService(this.app);

    this.registerView(
      VIEW_TYPE_ISSUES,
      (leaf) => new IssuesView(leaf, this.issueService),
    );

    this.addCommand({
      id: 'open-issues',
      name: 'Open issues',
      callback: () => {
        void this.activateIssuesView();
      },
    });

    this.addCommand({
      id: 'create-issue-for-current-note',
      name: 'Create issue for current note',
      callback: () => {
        void this.createIssueForCurrentNote();
      },
    });

    this.addRibbonIcon('circle-dot', 'Open issues', () => {
      void this.activateIssuesView();
    });

    const refreshForPath = (path: string): void => {
      if (this.isIssuesPath(path)) {
        void this.refreshOpenIssueViews();
      }
    };

    this.registerEvent(
      this.app.vault.on('create', (file) => refreshForPath(file.path)),
    );

    this.registerEvent(
      this.app.vault.on('modify', (file) => refreshForPath(file.path)),
    );

    this.registerEvent(
      this.app.vault.on('delete', (file) => refreshForPath(file.path)),
    );

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (this.isIssuesPath(file.path) || this.isIssuesPath(oldPath)) {
          void this.refreshOpenIssueViews();
        }
      }),
    );
  }

  onunload(): void {}

  private async activateIssuesView(): Promise<void> {
    await this.app.workspace.ensureSideLeaf(VIEW_TYPE_ISSUES, 'right', {
      active: true,
      reveal: true,
    });
  }

  private async refreshOpenIssueViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ISSUES);

    await Promise.all(
      leaves.map(async (leaf) => {
        await leaf.loadIfDeferred();

        if (leaf.view instanceof IssuesView) {
          await leaf.view.refresh();
        }
      }),
    );
  }

  private isIssuesPath(path: string): boolean {
    return path === ISSUES_FOLDER || path.startsWith(`${ISSUES_FOLDER}/`);
  }

  private async createIssueForCurrentNote(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active note to create an issue from.');
      return;
    }

    const [knownLabels, knownProjects, noteIssueCount] = await Promise.all([
      this.issueService.getAllLabels(),
      this.issueService.getAllProjects(),
      this.issueService.countIssuesForNote(activeFile.path),
    ]);

    new IssueModal(this.app, {
      title: 'New issue',
      initial: {
        title: `Issue ${noteIssueCount + 1}: ${activeFile.basename}`,
        project: activeFile.basename,
        source: activeFile.path,
      },
      knownLabels,
      knownProjects,
      statusEditable: false,
      submitLabel: 'Create',
      onSubmit: async (data) => {
        const file = await this.issueService.createIssue(data);
        await this.issueService.linkIssueToNote(activeFile.path, file.basename);
        await this.app.workspace.getLeaf(false).openFile(file);
        new Notice(`Created ${file.basename}`);
      },
    }).open();
  }
}
