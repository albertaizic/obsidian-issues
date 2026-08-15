import { ISSUE_STATUS_LABELS } from '../constants.ts';
import { dueState } from '../dates.ts';
import type { Issue } from '../types.ts';
import type { IssueActions } from '../components/issue-actions.ts';
import { renderDue, renderIssueId, renderLabels, renderPriority, renderSourceLink } from '../components/issue-meta.ts';
import { STATUS_GLYPHS, renderEmptyState } from '../components/issue-meta.ts';

export interface IssuesListDeps {
  actions: IssueActions;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export class IssuesList {
  constructor(private readonly deps: IssuesListDeps) {}

  render(container: HTMLElement, issues: Issue[]): void {
    if (issues.length === 0) {
      renderEmptyState(container, this.deps.hasActiveFilters, this.deps.onResetFilters);
      return;
    }

    for (const issue of issues) {
      this.renderIssueRow(container, issue);
    }
  }

  restoreFocus(): void {
    // The list has no persistent focus target between renders — the row click
    // handler opens the issue, so there is nothing to restore.
  }

  private renderIssueRow(container: HTMLElement, issue: Issue): void {
    const { actions } = this.deps;

    const row = container.createDiv({ cls: 'obsidian-issues-row' });
    row.addClass(`is-status-${issue.status}`);

    // The edge marker follows the same rule as the due-date text: a closed
    // issue is never flagged as overdue.
    if (issue.status !== 'closed') {
      const state = dueState(issue.due);
      if (state === 'today') row.addClass('is-due-today');
      if (state === 'overdue') row.addClass('is-overdue');
    }

    const topLine = row.createDiv({ cls: 'obsidian-issues-row-top' });

    const statusButton = topLine.createEl('button', {
      cls: `obsidian-issues-status-dot is-${issue.status}`,
      type: 'button',
      attr: {
        'aria-label': `${issue.title} is ${ISSUE_STATUS_LABELS[issue.status].toLowerCase()}. Change status.`,
      },
    });
    statusButton.createSpan({
      text: STATUS_GLYPHS[issue.status],
      attr: { 'aria-hidden': 'true' },
    });
    statusButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void actions.cycleStatus(issue);
    });

    const titleButton = topLine.createEl('button', {
      text: issue.title,
      cls: 'obsidian-issues-title',
      type: 'button',
    });
    titleButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void actions.openIssue(issue);
    });

    renderPriority(topLine, issue);

    const buttonGroup = topLine.createDiv({ cls: 'obsidian-issues-row-buttons' });
    actions.renderActionButtons(buttonGroup, issue);

    const meta = row.createDiv({ cls: 'obsidian-issues-meta' });
    renderIssueId(meta, issue);
    if (issue.project) {
      meta.createSpan({ text: issue.project, cls: 'obsidian-issues-project' });
    }
    renderLabels(meta, issue);
    renderDue(meta, issue);
    renderSourceLink(meta, issue, (path) => actions.openSource(path));

    row.addEventListener('click', () => {
      void actions.openIssue(issue);
    });

    row.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      actions.showContextMenu(issue, e);
    });
  }
}
