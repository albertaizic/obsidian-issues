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
  ISSUE_STATUS_LABELS,
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
  private contentWrapper: HTMLElement | null = null;
  private viewMode: 'list' | 'kanban' = 'list';
  private filters: FilterState = {
    search: '',
    status: 'all',
    project: '',
    priority: 'all',
    labels: [],
    sortBy: 'created',
    sortDir: 'desc',
  };

  private labelDropdownOpen = false;
  private labelDropdownBtn: HTMLElement | null = null;
  private labelDropdownPanel: HTMLElement | null = null;
  private listToggleButton: HTMLElement | null = null;
  private kanbanToggleButton: HTMLElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly issueService: IssueService,
  ) {
    super(leaf);
    this.navigation = false;
    const saved = sessionStorage.getItem('obsidian-issues-view-mode');
    if (saved === 'list' || saved === 'kanban') {
      this.viewMode = saved;
    }
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
    document.removeEventListener('click', this.handleDocumentClick);
    this.labelDropdownOpen = false;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('obsidian-issues-view');

    const header = contentEl.createDiv({ cls: 'obsidian-issues-header' });
    header.createEl('h2', { text: 'Issues' });
    this.renderViewToggle(header);

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

    const summary = contentEl.createDiv({ cls: 'obsidian-issues-summary' });
    for (const status of ISSUE_STATUSES) {
      const count = this.issues.filter((i) => i.status === status).length;
      summary.createSpan({ text: `${ISSUE_STATUS_LABELS[status].toUpperCase()} ${count}` });
    }

    const toolbar = contentEl.createDiv({ cls: 'obsidian-issues-toolbar' });
    this.renderToolbar(toolbar, this.issues);

    this.contentWrapper = contentEl.createDiv({
      cls: 'obsidian-issues-content',
    });
    this.renderContent();

    document.addEventListener('click', this.handleDocumentClick);
  }

  private handleDocumentClick = (e: MouseEvent): void => {
    if (
      this.labelDropdownOpen &&
      this.labelDropdownPanel &&
      this.labelDropdownBtn &&
      e.target instanceof Node &&
      !this.labelDropdownBtn.contains(e.target) &&
      !this.labelDropdownPanel.contains(e.target)
    ) {
      this.labelDropdownOpen = false;
      this.labelDropdownPanel.addClass('is-hidden');
    }
  };

  private renderViewToggle(header: HTMLElement): void {
    const toggle = header.createDiv({ cls: 'obsidian-issues-view-toggle' });
    const listBtn = toggle.createEl('button', {
      text: 'List',
      cls: `mod-plaintext obsidian-issues-view-toggle-button${this.viewMode === 'list' ? ' is-active' : ''}`,
    });
    const kanbanBtn = toggle.createEl('button', {
      text: 'Kanban',
      cls: `mod-plaintext obsidian-issues-view-toggle-button${this.viewMode === 'kanban' ? ' is-active' : ''}`,
    });
    this.listToggleButton = listBtn;
    this.kanbanToggleButton = kanbanBtn;
    listBtn.addEventListener('click', () => {
      void this.setViewMode('list');
    });
    kanbanBtn.addEventListener('click', () => {
      void this.setViewMode('kanban');
    });
  }

  private updateViewToggle(): void {
    this.listToggleButton?.toggleClass('is-active', this.viewMode === 'list');
    this.kanbanToggleButton?.toggleClass('is-active', this.viewMode === 'kanban');
  }

  private async setViewMode(mode: 'list' | 'kanban'): Promise<void> {
    this.viewMode = mode;
    sessionStorage.setItem('obsidian-issues-view-mode', mode);
    this.updateViewToggle();
    this.renderContent();
  }

  private renderToolbar(container: HTMLElement, issues: Issue[]): void {
    new TextComponent(container)
      .setPlaceholder('Search issues…')
      .setValue(this.filters.search)
      .onChange((value) => {
        this.filters.search = value;
        this.renderContent();
      });

    const statusDropdown = new DropdownComponent(container);
    statusDropdown.addOption('all', 'All');
    for (const status of ISSUE_STATUSES) {
      statusDropdown.addOption(status, ISSUE_STATUS_LABELS[status]);
    }
    statusDropdown.setValue(this.filters.status);
    statusDropdown.onChange((value) => {
      this.filters.status = value as 'all' | IssueStatus;
      this.renderContent();
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
      this.renderContent();
    });

    const priorityDropdown = new DropdownComponent(container);
    priorityDropdown.addOption('all', 'All priorities');
    for (const priority of ISSUE_PRIORITIES) {
      priorityDropdown.addOption(priority, ISSUE_PRIORITY_LABELS[priority]);
    }
    priorityDropdown.setValue(this.filters.priority);
    priorityDropdown.onChange((value) => {
      this.filters.priority = value as 'all' | IssuePriority;
      this.renderContent();
    });

    const labelSet = new Set<string>();
    for (const issue of issues) {
      for (const label of issue.labels) {
        labelSet.add(label);
      }
    }
    const knownLabels = [...labelSet].sort();
    if (knownLabels.length > 0) {
      const dropdownWrapper = container.createDiv({
        cls: 'obsidian-issues-label-dropdown-wrapper',
      });
      const dropdownBtn = dropdownWrapper.createEl('button', {
        text: this.filters.labels.length > 0
          ? `Labels (${this.filters.labels.length})`
          : 'Labels',
        cls: 'obsidian-issues-label-dropdown mod-plaintext',
        type: 'button',
      });
      this.labelDropdownBtn = dropdownBtn;

      const dropdownPanel = dropdownWrapper.createDiv({
        cls: 'obsidian-issues-label-dropdown-panel is-hidden',
      });
      this.labelDropdownPanel = dropdownPanel;

      dropdownBtn.addEventListener('click', () => {
        this.labelDropdownOpen = !this.labelDropdownOpen;
        dropdownPanel.toggleClass('is-hidden', !this.labelDropdownOpen);
      });

      for (const label of knownLabels) {
        const isActive = this.filters.labels.includes(label);
        const labelBtn = dropdownPanel.createSpan({
          text: label,
          cls: `obsidian-issues-label-filter${isActive ? ' is-active' : ''}`,
        });
        const color = getLabelColor(label);
        labelBtn.style.backgroundColor = color;
        labelBtn.style.color = getLabelTextColor(color);
        labelBtn.addEventListener('click', () => {
          const nowActive = this.filters.labels.includes(label);
          if (nowActive) {
            this.filters.labels = this.filters.labels.filter((l) => l !== label);
          } else {
            this.filters.labels = [...this.filters.labels, label];
          }
          labelBtn.toggleClass('is-active', !nowActive);
          this.updateLabelDropdownBtn();
          this.renderContent();
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
      this.renderContent();
    });
  }

  private updateLabelDropdownBtn(): void {
    if (!this.labelDropdownBtn) return;
    this.labelDropdownBtn.textContent = this.filters.labels.length > 0
      ? `Labels (${this.filters.labels.length})`
      : 'Labels';
  }

  private renderContent(): void {
    if (!this.contentWrapper) return;
    this.contentWrapper.empty();

    if (this.viewMode === 'list') {
      this.listEl = this.contentWrapper.createDiv({ cls: 'obsidian-issues-list' });
      this.renderList();
    } else {
      this.renderKanban();
    }
  }

  private renderList(): void {
    if (!this.listEl) return;

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

  private renderKanban(): void {
    if (!this.contentWrapper) return;

    const filtered = this.applyFilters(this.issues);
    const sorted = this.applySort(filtered);

    const hasIssues = sorted.length > 0;
    if (!hasIssues) {
      this.contentWrapper.createDiv({
        text: 'No issues match your filters.',
        cls: 'obsidian-issues-empty',
      });
      return;
    }

    for (const status of ISSUE_STATUSES) {
      const columnIssues = sorted.filter((i) => i.status === status);
      this.renderKanbanColumn(status, columnIssues);
    }
  }

  private renderKanbanColumn(
    status: IssueStatus,
    issues: Issue[],
  ): void {
    if (!this.contentWrapper) return;

    const column = this.contentWrapper.createDiv({
      cls: 'obsidian-issues-kanban-column',
    });
    column.dataset.status = status;

    const header = column.createDiv({
      cls: 'obsidian-issues-kanban-column-header',
    });
    header.createSpan({ text: ISSUE_STATUS_LABELS[status] });
    header.createSpan({
      text: String(issues.length),
      cls: 'obsidian-issues-kanban-column-count',
    });

    const body = column.createDiv({
      cls: 'obsidian-issues-kanban-column-body',
    });

    for (const issue of issues) {
      this.renderKanbanCard(issue, body);
    }

    column.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      column.addClass('is-drag-over');
    });
    column.addEventListener('dragleave', () => {
      column.removeClass('is-drag-over');
    });
    column.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      column.removeClass('is-drag-over');
      const issueId = e.dataTransfer?.getData('text/plain');
      if (!issueId) return;
      const issue = this.issues.find((i) => i.id === issueId);
      if (!issue || issue.status === status) return;
      void this.updateIssueStatus(issue, status);
    });
  }

  private renderKanbanCard(issue: Issue, container: HTMLElement): void {
    const card = container.createDiv({
      cls: 'obsidian-issues-kanban-card',
    });
    card.dataset.issueId = issue.id;
    card.setAttr('draggable', 'true');

    card.createSpan({ text: issue.id, cls: 'obsidian-issues-kanban-card-id' });
    card.createSpan({ text: issue.title, cls: 'obsidian-issues-kanban-card-title' });

    const meta = card.createDiv({ cls: 'obsidian-issues-kanban-card-meta' });
    meta.createSpan({
      text: issue.priority.toUpperCase(),
      cls: `obsidian-issues-priority is-${issue.priority}`,
    });
    if (issue.due) {
      const dueDate = parseDueDate(issue.due);
      meta.createSpan({
        text: `Due ${dueDate.format('DD/MM/YYYY')}`,
        cls: 'obsidian-issues-due',
      });
    }

    card.addEventListener('dragstart', (e: DragEvent) => {
      e.dataTransfer?.setData('text/plain', issue.id);
      card.addClass('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.removeClass('is-dragging');
    });
    card.addEventListener('click', () => {
      void this.app.workspace.getLeaf(false).openFile(issue.file);
    });
  }

  private renderIssueRow(issue: Issue): void {
    const row = this.listEl!.createDiv({ cls: 'obsidian-issues-row' });
    if (issue.status.toLowerCase() === 'closed') {
      row.addClass('is-closed');
    }
    if (issue.due) {
      const dueDate = parseDueDate(issue.due);
      if (dueDate.isValid() && dueDate.isBefore(moment(), 'day')) {
        row.addClass('is-overdue');
      }
    }
    row.setAttr('role', 'button');
    row.setAttr('tabindex', '0');

    const topLine = row.createDiv({ cls: 'obsidian-issues-row-top' });
    const statusDot = topLine.createSpan({
      text: issue.status === 'closed' ? '○' : '●',
      cls: `obsidian-issues-status-dot is-${issue.status === 'in-progress' ? 'in-progress' : issue.status}`,
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

    const buttonGroup = topLine.createDiv({
      cls: 'obsidian-issues-row-buttons',
    });

    const editButton = buttonGroup.createEl('button', {
      cls: 'obsidian-issues-edit-button mod-secondary',
      title: 'Edit issue',
    });
    setIcon(editButton, 'pencil');
    editButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.editIssue(issue);
    });

    const deleteButton = buttonGroup.createEl('button', {
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
        text: `Due ${parseDueDate(issue.due).format('DD/MM/YYYY')}`,
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
        if (!issue.labels.some((l) => this.filters.labels.includes(l))) {
          return false;
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

  private async updateIssueStatus(
    issue: Issue,
    status: IssueStatus,
  ): Promise<void> {
    try {
      await this.issueService.updateIssue(issue.file, { status });
      await this.refresh();
    } catch (error) {
      console.error('Obsidian Issues: failed to update issue status', error);
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

function parseDueDate(value: string): moment.Moment {
  const parsed = moment(value, 'DD/MM/YYYY', true);
  if (parsed.isValid()) return parsed;
  return moment(value, 'YYYY-MM-DD', true);
}

function normalizeDate(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return value;
}

function issueField(issue: Issue, field: 'created' | 'due'): string {
  return field === 'created' ? issue.created : normalizeDate(issue.due);
}
