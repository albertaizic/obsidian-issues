import { ISSUE_STATUSES, ISSUE_STATUS_LABELS } from '../constants.ts';
import type { IssueStatus } from '../types.ts';
import type { Issue } from '../types.ts';
import type { IssueActions } from '../components/issue-actions.ts';
import {
  renderDue,
  renderIssueId,
  renderLabels,
  renderPriority,
  renderSourceLink,
} from '../components/issue-meta.ts';
import { renderEmptyState } from '../components/issue-meta.ts';

export interface IssuesKanbanDeps {
  actions: IssueActions;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export class IssuesKanban {
  private draggingId: string | null = null;
  private lastDragEnd = 0;
  private renderedContainer: HTMLElement | null = null;
  private renderedIssues: Issue[] = [];

  constructor(private readonly deps: IssuesKanbanDeps) {}

  render(container: HTMLElement, issues: Issue[]): void {
    this.renderedContainer = container;
    this.renderedIssues = issues;

    const board = container.createDiv({ cls: 'obsidian-issues-kanban' });

    for (const status of ISSUE_STATUSES) {
      this.renderColumn(board, status, issues.filter((i) => i.status === status));
    }

    if (issues.length === 0 && this.deps.hasActiveFilters) {
      renderEmptyState(container, true, this.deps.onResetFilters);
    }
  }

  restoreFocus(pendingFocusId: string | null): void {
    if (pendingFocusId === null || this.renderedContainer === null) return;
    const target = this.renderedContainer.querySelector<HTMLElement>(
      `.obsidian-issues-kanban-card[data-issue-id="${CSS.escape(pendingFocusId)}"]`,
    );
    target?.focus();
  }

  private renderColumn(
    board: HTMLElement,
    status: IssueStatus,
    issues: Issue[],
  ): void {
    const { actions } = this.deps;

    // An aria-label needs a role to be announced; on a bare div it is ignored.
    const column = board.createDiv({
      cls: 'obsidian-issues-kanban-column',
      attr: { role: 'group', 'aria-label': `${ISSUE_STATUS_LABELS[status]} column` },
    });
    column.dataset.status = status;

    const header = column.createDiv({ cls: 'obsidian-issues-kanban-column-header' });
    header.createSpan({
      text: ISSUE_STATUS_LABELS[status],
      cls: `obsidian-issues-kanban-column-title is-${status}`,
    });
    header.createSpan({
      text: String(issues.length),
      cls: 'obsidian-issues-kanban-column-count',
    });

    const body = column.createDiv({
      cls: 'obsidian-issues-kanban-column-body',
      attr: { role: 'list' },
    });

    if (issues.length === 0) {
      body.createDiv({
        text: 'Drop issues here',
        cls: 'obsidian-issues-kanban-column-empty',
        attr: { role: 'listitem' },
      });
    } else {
      for (const issue of issues) {
        this.renderCard(issue, body);
      }
    }

    column.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      column.addClass('is-drag-over');
    });
    column.addEventListener('dragleave', (e: DragEvent) => {
      if (e.relatedTarget instanceof Node && column.contains(e.relatedTarget)) return;
      column.removeClass('is-drag-over');
    });
    column.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      column.removeClass('is-drag-over');
      const issueId = e.dataTransfer?.getData('text/plain');
      if (!issueId) {
        this.draggingId = null;
        return;
      }
      const issue = this.renderedIssues.find((i) => i.id === issueId);
      if (!issue || issue.status === status) {
        this.draggingId = null;
        return;
      }
      void actions.updateIssueStatus(issue, status);
    });
  }

  private renderCard(issue: Issue, container: HTMLElement): void {
    const { actions } = this.deps;

    // `role="listitem"` rather than `role="button"`: the card contains its own
    // buttons, and a button may not contain interactive descendants.
    const card = container.createDiv({
      cls: 'obsidian-issues-kanban-card',
      attr: {
        draggable: 'true',
        tabindex: '0',
        role: 'listitem',
        'aria-label': `${issue.title}, ${ISSUE_STATUS_LABELS[issue.status]}`,
      },
    });
    card.dataset.issueId = issue.id;
    card.addClass(`is-status-${issue.status}`);

    const topLine = card.createDiv({ cls: 'obsidian-issues-kanban-card-top' });
    renderIssueId(topLine, issue, 'obsidian-issues-kanban-card-id');
    const cardTitle = topLine.createEl('button', {
      text: issue.title,
      cls: 'obsidian-issues-kanban-card-title',
      type: 'button',
    });
    cardTitle.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void actions.openIssue(issue);
    });

    const actionButtons = topLine.createDiv({ cls: 'obsidian-issues-card-buttons' });
    actions.renderActionButtons(actionButtons, issue);

    const meta = card.createDiv({ cls: 'obsidian-issues-kanban-card-meta' });
    renderPriority(meta, issue);
    renderDue(meta, issue);
    renderLabels(meta, issue);
    renderSourceLink(meta, issue, (path) => actions.openSource(path));

    card.addEventListener('dragstart', (e: DragEvent) => {
      this.draggingId = issue.id;
      e.dataTransfer?.setData('text/plain', issue.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      card.addClass('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.removeClass('is-dragging');
      this.draggingId = null;
      this.lastDragEnd = Date.now();
    });
    card.addEventListener('click', () => {
      if (this.draggingId !== null || Date.now() - this.lastDragEnd < 200) return;
      void actions.openIssue(issue);
    });
    card.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void actions.openIssue(issue);
        return;
      }
      // Keyboard equivalent of dragging a card between columns.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const index = ISSUE_STATUSES.indexOf(issue.status);
        const target = ISSUE_STATUSES[index + (e.key === 'ArrowRight' ? 1 : -1)];
        if (target) void actions.updateIssueStatus(issue, target, true);
      }
    });

    card.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      actions.showContextMenu(issue, e);
    });
  }
}
