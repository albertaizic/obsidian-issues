import { ItemView, moment, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_ISSUES } from './constants';
import { IssueModal } from './issue-modal';
import { getLabelColor, getLabelTextColor } from './labels';
import type { Issue } from './types';
import type { IssueService } from './issue-service';

export class IssuesView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly issueService: IssueService,
  ) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string {
    return VIEW_TYPE_ISSUES;
  }

  getDisplayText(): string {
    return 'Issues';
  }

  getIcon(): string {
    return 'circle-dot';
  }

  protected async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('obsidian-issues-view');

    const header = contentEl.createDiv({ cls: 'obsidian-issues-header' });
    header.createEl('h2', { text: 'Issues' });

    const newIssueButton = header.createEl('button', {
      text: '+ new issue',
      cls: 'mod-cta obsidian-issues-new-button',
    });

    newIssueButton.addEventListener('click', () => {
      new IssueModal(this.app, {
        title: 'New issue',
        initial: {},
        statusEditable: false,
        submitLabel: 'Create',
        onSubmit: async (data) => {
          newIssueButton.disabled = true;
          try {
            const file = await this.issueService.createIssue(data);
            await this.app.workspace.getLeaf(false).openFile(file);
            new Notice(`Created ${file.basename}`);
          } catch (error) {
            console.error('Obsidian Issues: failed to create issue', error);
            new Notice('Could not create issue. Check the developer console.');
          } finally {
            newIssueButton.disabled = false;
          }
        },
      }).open();
    });

    const issues = await this.issueService.listIssues();
    const openCount = issues.filter((issue) => issue.status.toLowerCase() === 'open').length;
    const closedCount = issues.filter((issue) => issue.status.toLowerCase() === 'closed').length;

    const summary = contentEl.createDiv({ cls: 'obsidian-issues-summary' });
    summary.createSpan({ text: `OPEN ${openCount}` });
    summary.createSpan({ text: `CLOSED ${closedCount}` });

    const list = contentEl.createDiv({ cls: 'obsidian-issues-list' });

    if (issues.length === 0) {
      list.createDiv({
        text: 'No issues yet. Create your first one.',
        cls: 'obsidian-issues-empty',
      });
      return;
    }

    for (const issue of issues) {
      const row = list.createDiv({ cls: 'obsidian-issues-row' });
      row.setAttr('role', 'button');
      row.setAttr('tabindex', '0');

      const topLine = row.createDiv({ cls: 'obsidian-issues-row-top' });
      const statusDot = topLine.createSpan({
        text: issue.status.toLowerCase() === 'closed' ? '○' : '●',
        cls: `obsidian-issues-status-dot is-${issue.status.toLowerCase()}`,
      });
      statusDot.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        void this.toggleStatus(issue);
      });
      topLine.createSpan({ text: issue.title, cls: 'obsidian-issues-title' });
      topLine.createSpan({
        text: issue.priority.toUpperCase(),
        cls: `obsidian-issues-priority is-${issue.priority}`,
      });

      const editButton = topLine.createEl('button', {
        cls: 'obsidian-issues-edit-button mod-secondary',
        title: 'Edit issue',
      });
      setIcon(editButton, 'pencil');
      editButton.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        void this.editIssue(issue);
      });

      const meta = row.createDiv({ cls: 'obsidian-issues-meta' });
      meta.createSpan({ text: issue.id });
      if (issue.project) {
        meta.createSpan({ text: issue.project });
      }
      if (issue.labels.length > 0) {
        const labelsContainer = meta.createDiv({
          cls: 'obsidian-issues-labels',
        });
        for (const label of issue.labels) {
          const color = getLabelColor(label);
          const tag = labelsContainer.createSpan({
            text: label,
            cls: 'obsidian-issues-label',
          });
          tag.style.backgroundColor = color;
          tag.style.color = getLabelTextColor(color);
        }
      }
      if (issue.due) {
        meta.createSpan({
          text: `Due ${moment(issue.due).format('MMM D')}`,
          cls: 'obsidian-issues-due',
        });
      }

      const openIssue = (): void => {
        void this.app.workspace.getLeaf(false).openFile(issue.file);
      };

      row.addEventListener('click', openIssue);
      row.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openIssue();
        }
      });
    }
  }

  private async toggleStatus(issue: Issue): Promise<void> {
    try {
      await this.issueService.toggleIssueStatus(issue.file);
      await this.refresh();
    } catch (error) {
      console.error('Obsidian Issues: failed to toggle status', error);
      new Notice('Could not update issue. Check the developer console.');
    }
  }

  private editIssue(issue: Issue): void {
    new IssueModal(this.app, {
      title: 'Edit issue',
      initial: issue,
      statusEditable: true,
      submitLabel: 'Save',
      onSubmit: async (data) => {
        try {
          await this.issueService.updateIssue(issue.file, data);
        } catch (error) {
          console.error('Obsidian Issues: failed to update issue', error);
          new Notice('Could not save issue. Check the developer console.');
        }
      },
    }).open();
  }
}
