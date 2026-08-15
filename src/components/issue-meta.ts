import type { Issue } from '../types.ts';
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
} from '../constants.ts';
import type { IssueStatus } from '../types.ts';
import { applyLabelColor } from '../labels.ts';
import { dueState, dueVariant, toDisplayDate } from '../dates.ts';
import { shortIssueId } from '../utils/issue-id.ts';

export const STATUS_GLYPHS: Record<IssueStatus, string> = {
  open: '●',
  'in-progress': '◐',
  closed: '○',
};

export function renderIssueId(
  container: HTMLElement,
  issue: Issue,
  className = 'obsidian-issues-issue-id',
): void {
  container.createSpan({ text: shortIssueId(issue.id), cls: className });
}

export function renderPriority(container: HTMLElement, issue: Issue): void {
  container.createSpan({
    text: ISSUE_PRIORITY_LABELS[issue.priority].toUpperCase(),
    cls: `obsidian-issues-priority is-${issue.priority}`,
  });
}

export function renderLabels(container: HTMLElement, issue: Issue): void {
  if (issue.labels.length === 0) return;
  const labelsContainer = container.createDiv({ cls: 'obsidian-issues-labels' });
  for (const label of issue.labels) {
    const tag = labelsContainer.createSpan({
      text: label,
      cls: 'obsidian-issues-label',
    });
    applyLabelColor(tag, label);
  }
}

/**
 * A malformed `due:` value used to render as the literal string
 * "Due Invalid date"; it is now flagged as such and styled as an error.
 *
 * Urgency colouring (amber today, red overdue) only applies while the issue
 * is still actionable — a closed issue's deadline is history, so it stays
 * muted rather than shouting at the reader.
 */
export function renderDue(container: HTMLElement, issue: Issue): void {
  const variant = dueVariant(issue.due, issue.status === 'closed');
  if (variant === 'none') return;

  if (variant === 'invalid') {
    container.createSpan({
      text: `Due date unreadable: ${issue.due}`,
      cls: 'obsidian-issues-due is-invalid',
      attr: { title: 'Expected DD/MM/YYYY or YYYY-MM-DD' },
    });
    return;
  }

  const display = toDisplayDate(issue.due);
  const label =
    variant === 'today'
      ? `Due today · ${display}`
      : variant === 'overdue'
        ? `Overdue · ${display}`
        : `Due ${display}`;

  container.createSpan({
    text: label,
    cls: `obsidian-issues-due is-${variant}`,
    attr:
      variant === 'done' && dueState(issue.due) === 'overdue'
        ? { title: 'Was past its due date when closed' }
        : {},
  });
}

export function renderSourceLink(
  container: HTMLElement,
  issue: Issue,
  onOpen: (path: string) => void,
): void {
  if (!issue.source) return;
  const name = issue.source.replace(/\.md$/, '').split('/').pop() ?? issue.source;
  const sourceLink = container.createEl('a', {
    text: name,
    cls: 'obsidian-issues-source-link',
    attr: { href: '#', title: issue.source, 'aria-label': `Open source note ${name}` },
  });
  sourceLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onOpen(issue.source);
  });
}

export function renderEmptyState(
  container: HTMLElement,
  hasFilters: boolean,
  onReset: () => void,
): void {
  const empty = container.createDiv({ cls: 'obsidian-issues-empty' });
  empty.createSpan({
    text: hasFilters
      ? 'No issues match your filters.'
      : 'No issues yet. Create one with "+ New issue".',
  });
  if (hasFilters) {
    const reset = empty.createEl('button', {
      text: 'Reset filters',
      cls: 'obsidian-issues-empty-reset',
      type: 'button',
    });
    reset.addEventListener('click', onReset);
  }
}

export const STATUS_LABELS = ISSUE_STATUS_LABELS;
