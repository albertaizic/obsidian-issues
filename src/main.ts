import { Plugin } from 'obsidian';
import { ISSUES_FOLDER, VIEW_TYPE_ISSUES } from './constants';
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
      name: 'Open Issues',
      callback: () => {
        void this.activateIssuesView();
      },
    });

    this.addRibbonIcon('circle-dot', 'Open Issues', () => {
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

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ISSUES);
  }

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
}
