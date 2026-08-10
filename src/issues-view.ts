import {
  DropdownComponent,
  ItemView,
  moment,
  Notice,
  setIcon,
  TextComponent,
  WorkspaceLeaf,
} from 'obsidian';
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUSES,
  VIEW_TYPE_ISSUES,
} from './constants';
import { IssueModal } from './issue-modal';
import { getLabelColor, getLabelTextColor } from './labels';
import type { Issue, IssuePriority, IssueStatus } from './types';
import type { IssueService } from './issue-service';

interface FilterState {
  search: string;
  status: 'all' | IssueStatus;
  project: string;
  priority: 'all' | IssuePriority;
  labels: string[];
  sortBy: 'created' | 'due' | 'priority';
  sortDir: 'asc' | 'desc';
}

export class IssuesView extends ItemView {
  private issues: Issue[] = [];
  private listEl: HTMLElement | null = null;
  private filters: FilterState = {
    search: '',
    status: 'all',
    project: '',
    priority: 'all',
    labels: [],
    sortBy: 'created',
    sortDir: 'desc',
  };

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
      void (async () => {
        const [knownLabels, knownProjects] = await Promise.all([
          this.issueService.getAllLabels(),
          this.issueService.getAllProjects(),
        ]);

        new IssueModal(this.app, {
          title: 'New issue',
          initial: {},
          knownLabels,
          knownProjects,
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
      })();
    });

    this.issues = await this.issueService.listIssues();

    const openCount = this.issues.filter(
      (issue) => issue.status.toLowerCase() === 'open',
    ).length;
    const closedCount = this.issues.filter(
      (issue) => issue.status.toLowerCase() === 'closed',
    ).length;

    const summary = contentEl.createDiv({ cls: 'obsidian-issues-summary' });
    summary.createSpan({ text: `OPEN ${openCount}` });
    summary.createSpan({ text: `CLOSED ${closedCount}` });

    const toolbar = contentEl.createDiv({ cls: 'obsidian-issues-toolbar' });
    this.renderToolbar(toolbar, this.issues);

    this.listEl = contentEl.createDiv({ cls: 'obsidian-issues-list' });
    this.renderList();
  }

  private renderToolbar(container: HTMLElement, issues: Issue[]): void {
    new TextComponent(container)
      .setPlaceholder('Search issues…')
      .setValue(this.filters.search)
      .onChange((value) => {
        this.filters.search = value;
        this.renderList();
      });

    const statusDropdown = new DropdownComponent(container);
    statusDropdown.addOption('all', 'All');
    for (const status of ISSUE_STATUSES) {
      statusDropdown.addOption(status, status.charAt(0).toUpperCase() + status.slice(1));
    }
    statusDropdown.setValue(this.filters.status);
    statusDropdown.onChange((value) => {
      this.filters.status = value as 'all' | IssueStatus;
      this.renderList();
    });

    const projectDropdown = new DropdownComponent(container);
    projectDropdown.addOption('', 'All projects');
    const knownProjects = Array.from(
      new Set(issues.map((i) => i.project).filter((p) => p.length > 0)),
    ).sort();
    for (const project of knownProjects) {
      projectDropdown.addOption(project, project);
    }
    projectDropdown.setValue(this.filters.project);
    projectDropdown.onChange((value) => {
      this.filters.project = value;
      this.renderList();
    });

    const priorityDropdown = new DropdownComponent(container);
    priorityDropdown.addOption('all', 'All priorities');
    for (const priority of ISSUE_PRIORITIES) {
      priorityDropdown.addOption(priority, ISSUE_PRIORITY_LABELS[priority]);
    }
    priorityDropdown.setValue(this.filters.priority);
    priorityDropdown.onChange((value) => {
      this.filters.priority = value as 'all' | IssuePriority;
      this.renderList();
    });

    const labelSet = new Set<string>();
    for (const issue of issues) {
      for (const label of issue.labels) {
        labelSet.add(label);
      }
    }
    const knownLabels = [...labelSet].sort();
    if (knownLabels.length > 0) {
      const labelsContainer = container.createDiv({
        cls: 'obsidian-issues-label-filters',
      });
      for (const label of knownLabels) {
        const isActive = this.filters.labels.includes(label);
        const tag = labelsContainer.createSpan({
          text: label,
          cls: `obsidian-issues-label-filter${isActive ? ' is-active' : ''}`,
        });
        const color = getLabelColor(label);
        tag.style.backgroundColor = color;
        tag.style.color = getLabelTextColor(color);
        tag.addEventListener('click', () => {
          if (isActive) {
            this.filters.labels = this.filters.labels.filter((l) => l !== label);
          } else {
            this.filters.labels = [...this.filters.labels, label];
          }
          this.renderList();
        });
      }
    }

    const sortDropdown = new DropdownComponent(container);
    sortDropdown.addOption('created-desc', 'Created ↓');
    sortDropdown.addOption('created-asc', 'Created ↑');
    sortDropdown.addOption('due-desc', 'Due ↓');
    sortDropdown.addOption('due-asc', 'Due ↑');
    sortDropdown.addOption('priority-desc', 'Priority ↓');
    sortDropdown.addOption('priority-asc', 'Priority ↑');
    const sortValue = `${this.filters.sortBy}-${this.filters.sortDir}`;
    sortDropdown.setValue(sortValue);
    sortDropdown.onChange((value) => {
      const [sortBy, sortDir] = value.split('-') as ['created' | 'due' | 'priority', 'asc' | 'desc'];
      this.filters.sortBy = sortBy;
      this.filters.sortDir = sortDir;
      this.renderList();
    });
  }

  private renderList(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    const filtered = this.applyFilters(this.issues);
    const sorted = this.applySort(filtered);

    if (sorted.length === 0) {
      this.listEl.createDiv({
        text: 'No issues match your filters.',
        cls: 'obsidian-issues-empty',
      });
      return;
    }

    for (const issue of sorted) {
      this.renderIssueRow(issue);
    }
  }

  private renderIssueRow(issue: Issue): void {
    const row = this.listEl!.createDiv({ cls: 'obsidian-issues-row' });
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

    const deleteButton = topLine.createEl('button', {
      cls: 'obsidian-issues-delete-button mod-warning',
      title: 'Delete issue',
    });
    setIcon(deleteButton, 'trash-2');
    deleteButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.deleteIssue(issue);
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

  private applyFilters(issues: Issue[]): Issue[] {
    return issues.filter((issue) => {
      if (
        this.filters.search &&
        !issue.title.toLowerCase().includes(this.filters.search.toLowerCase()) &&
        !issue.body.toLowerCase().includes(this.filters.search.toLowerCase())
      ) {
        return false;
      }
      if (this.filters.status !== 'all' && issue.status !== this.filters.status) {
        return false;
      }
      if (this.filters.project && issue.project !== this.filters.project) {
        return false;
      }
      if (this.filters.priority !== 'all' && issue.priority !== this.filters.priority) {
        return false;
      }
      if (this.filters.labels.length > 0) {
        for (const label of this.filters.labels) {
          if (!issue.labels.includes(label)) {
            return false;
          }
        }
      }
      return true;
    });
  }

  private applySort(issues: Issue[]): Issue[] {
    const { sortBy, sortDir } = this.filters;
    const multiplier = sortDir === 'asc' ? 1 : -1;

    return [...issues].sort((a, b) => {
      let compareValue = 0;

      if (sortBy === 'created' || sortBy === 'due') {
        const aVal = issueField(a, sortBy) || '';
        const bVal = issueField(b, sortBy) || '';
        compareValue = aVal.localeCompare(bVal);
      } else if (sortBy === 'priority') {
        const aIdx = ISSUE_PRIORITIES.indexOf(a.priority);
        const bIdx = ISSUE_PRIORITIES.indexOf(b.priority);
        compareValue = aIdx - bIdx;
      }

      return compareValue * multiplier;
    });
  }

  private async deleteIssue(issue: Issue): Promise<void> {
    try {
      await this.issueService.deleteIssue(issue.file);
      await this.refresh();
    } catch (error) {
      console.error('Obsidian Issues: failed to delete issue', error);
      new Notice('Could not delete issue. Check the developer console.');
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

  private async editIssue(issue: Issue): Promise<void> {
    const [knownLabels, knownProjects] = await Promise.all([
      this.issueService.getAllLabels(),
      this.issueService.getAllProjects(),
    ]);

    new IssueModal(this.app, {
      title: 'Edit issue',
      initial: issue,
      knownLabels,
      knownProjects,
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

function issueField(issue: Issue, field: 'created' | 'due'): string {
  return field === 'created' ? issue.created : issue.due;
}
