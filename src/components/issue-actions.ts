import { App, Menu, Notice, TFile, setIcon } from 'obsidian';
import {
  ISSUE_STATUS_LABELS,
  statusMenuItems,
} from '../constants.ts';
import { ConfirmModal } from '../confirm-modal.ts';
import type { Issue, IssueStatus } from '../types.ts';
import { IssueModal } from '../issue-modal.ts';
import { shortIssueId } from '../utils/issue-id.ts';
import type { IssueService } from '../issue-service.ts';
import type { IssuesViewHost } from '../config/settings.ts';

export interface IssueActionDeps {
  app: App;
  issueService: IssueService;
  host: IssuesViewHost;
  onMutated: () => Promise<void>;
  setPendingFocus: (id: string | null) => void;
}

export class IssueActions {
  constructor(private readonly deps: IssueActionDeps) {}

  async openIssue(issue: Issue): Promise<void> {
    await this.deps.app.workspace.getLeaf(false).openFile(issue.file);
  }

  openSource(path: string): void {
    const sourceFile = this.deps.app.vault.getAbstractFileByPath(path);
    if (sourceFile instanceof TFile) {
      void this.deps.app.workspace.getLeaf(false).openFile(sourceFile);
    } else {
      new Notice('Source note not found.');
    }
  }

  async editIssue(issue: Issue): Promise<void> {
    try {
      const [knownLabels, knownProjects] = await Promise.all([
        this.deps.issueService.getAllLabels(),
        this.deps.issueService.getAllProjects(),
      ]);

      new IssueModal(this.deps.app, {
        title: `Edit ${shortIssueId(issue.id)}`,
        initial: issue,
        knownLabels,
        knownProjects,
        statusEditable: true,
        submitLabel: 'Save',
        onSubmit: async (data) => {
          await this.deps.issueService.updateIssue(issue.file, data);
          await this.deps.onMutated();
        },
      }).open();
    } catch (error) {
      console.error('Vault Issues: failed to open edit modal', error);
      new Notice('Could not open issue. Check the developer console.');
    }
  }

  async deleteIssue(issue: Issue): Promise<void> {
    if (this.deps.host.settings.confirmDelete) {
      const confirmed = await ConfirmModal.show(this.deps.app, {
        title: 'Delete issue',
        message: `Move "${issue.title}" (${shortIssueId(issue.id)}) to the trash?`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!confirmed) return;
    }

    try {
      await this.deps.issueService.unlinkIssueFromNote(issue.id, issue.source);
      await this.deps.issueService.deleteIssue(issue.file);
      new Notice(`Deleted ${issue.file.basename}`);
      await this.deps.onMutated();
    } catch (error) {
      console.error('Vault Issues: failed to delete issue', error);
      new Notice('Could not delete issue. Check the developer console.');
    }
  }

  async cycleStatus(issue: Issue): Promise<void> {
    try {
      const status = await this.deps.issueService.cycleIssueStatus(issue.file);
      new Notice(`${shortIssueId(issue.id)} → ${ISSUE_STATUS_LABELS[status].toLowerCase()}`);
      await this.deps.onMutated();
    } catch (error) {
      console.error('Vault Issues: failed to change status', error);
      new Notice('Could not update issue. Check the developer console.');
    }
  }

  async updateIssueStatus(
    issue: Issue,
    status: IssueStatus,
    keepFocus = false,
  ): Promise<void> {
    try {
      if (keepFocus) this.deps.setPendingFocus(issue.id);
      await this.deps.issueService.updateIssue(issue.file, { status });
      await this.deps.onMutated();
    } catch (error) {
      console.error('Vault Issues: failed to update issue status', error);
      new Notice('Could not update issue. Check the developer console.');
    }
  }

  /** Renders the shared edit and delete icon buttons into `container`. */
  renderActionButtons(container: HTMLElement, issue: Issue): void {
    const editButton = container.createEl('button', {
      cls: 'obsidian-issues-edit-button',
      type: 'button',
      attr: { 'aria-label': `Edit ${issue.title}` },
    });
    setIcon(editButton, 'pencil');
    editButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.editIssue(issue);
    });

    const deleteButton = container.createEl('button', {
      cls: 'obsidian-issues-delete-button mod-warning',
      type: 'button',
      attr: { 'aria-label': `Delete ${issue.title}` },
    });
    setIcon(deleteButton, 'trash-2');
    deleteButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.deleteIssue(issue);
    });
  }

  showContextMenu(issue: Issue, evt: MouseEvent): void {
    const app = this.deps.app;
    const menu = new Menu();

    // Grouped with setSection: Obsidian draws the separators itself, and the
    // grouping is what keeps the status entries from reading as top-level
    // commands. (These typings have no setSubmenu, so a nested menu isn't
    // available at the declared minAppVersion.)
    menu
      .addItem((item) => {
        item.setSection('open').setTitle('Open').setIcon('eye').onClick(() => {
          void this.openIssue(issue);
        });
      })
      .addItem((item) => {
        item.setSection('open').setTitle('Edit').setIcon('pencil').onClick(() => {
          void this.editIssue(issue);
        });
      });

    // Status entries are phrased as actions ("Mark as open") rather than bare
    // status names: a plain "Open" here would be the second, unrelated "Open"
    // in the same menu and read as a duplicate of the command above.
    for (const option of statusMenuItems(issue.status)) {
      menu.addItem((item) => {
        item
          .setSection('status')
          .setTitle(`Mark as ${option.label.toLowerCase()}`)
          .setChecked(option.checked)
          .setDisabled(option.checked)
          .onClick(() => {
            void this.updateIssueStatus(issue, option.value);
          });
      });
    }

    // Open source note — only when the note exists on disk.
    if (issue.source.length > 0) {
      const sourceFile = app.vault.getAbstractFileByPath(issue.source);
      if (sourceFile instanceof TFile) {
        menu.addItem((item) => {
          item
            .setSection('links')
            .setTitle('Open source note')
            .setIcon('note')
            .onClick(() => {
              this.openSource(issue.source);
            });
        });
      }
    }

    menu.addItem((item) => {
      item
        .setSection('danger')
        .setTitle('Delete')
        .setIcon('trash-2')
        .setWarning(true)
        .onClick(() => {
          void this.deleteIssue(issue);
        });
    });

    menu.showAtMouseEvent(evt);
  }
}
