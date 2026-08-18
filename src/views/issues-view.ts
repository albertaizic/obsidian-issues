import {
  ItemView,
  Notice,
  WorkspaceLeaf,
} from 'obsidian';
import { ISSUE_STATUS_LABELS, ISSUE_STATUSES, VIEW_TYPE_ISSUES } from '../constants.ts';
import { IssueModal } from '../issue-modal.ts';
import type { Issue } from '../types.ts';
import type { IssueService } from '../issue-service.ts';
import {
  hasActiveFilters,
  type FilterState,
  defaultFilters,
  filterIssues,
  resetFilters,
  visibleCount,
} from '../filters/issue-filter.ts';
import { sortIssues } from '../filters/issue-sort.ts';
import type {
  IssuesViewHost,
  IssueViewMode,
} from '../config/settings.ts';
import { IssueActions } from '../components/issue-actions.ts';
import { IssuesToolbar } from '../components/issues-toolbar.ts';
import type { ToolbarCallbacks, ToolbarDeps } from '../components/issues-toolbar.ts';
import { IssuesList } from './issues-list.ts';
import { IssuesKanban } from './issues-kanban.ts';

interface ScrollSnapshot {
  view: number;
  board: number;
  columns: Record<string, number>;
}

export class IssuesView extends ItemView {
  private issues: Issue[] = [];
  private summaryEl: HTMLElement | null = null;
  private toolbarContainer: HTMLElement | null = null;
  private contentWrapper: HTMLElement | null = null;
  private viewMode: IssueViewMode;
  private filters: FilterState;

  private listToggleButton: HTMLElement | null = null;
  private kanbanToggleButton: HTMLElement | null = null;
  /** Facet signature, so the toolbar is only rebuilt when its options change. */
  private facetSignature = '';
  /** Set between dragstart and dragend so the trailing click doesn't open a note. */
  private pendingFocusId: string | null = null;

  private toolbar: IssuesToolbar | null = null;
  private list: IssuesList | null = null;
  private kanban: IssuesKanban | null = null;
  private actions: IssueActions;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly issueService: IssueService,
    private readonly host: IssuesViewHost,
  ) {
    super(leaf);
    this.navigation = false;
    this.viewMode = host.settings.viewMode;
    this.filters = defaultFilters(host.settings);

    this.actions = new IssueActions({
      app: this.app,
      issueService,
      host,
      onMutated: () => this.reload(),
      setPendingFocus: (id) => {
        this.pendingFocusId = id;
      },
    });

    this.list = new IssuesList({
      actions: this.actions,
      hasActiveFilters: hasActiveFilters(this.filters),
      onResetFilters: () => this.onResetOrLayoutChange(),
    });

    this.kanban = new IssuesKanban({
      actions: this.actions,
      hasActiveFilters: hasActiveFilters(this.filters),
      onResetFilters: () => this.onResetOrLayoutChange(),
    });
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

  protected async onClose(): Promise<void> {
    this.toolbar?.destroy();
  }

  async refresh(): Promise<void> {
    this.issues = await this.issueService.listIssues();
    this.renderAll();
  }

  async reload(): Promise<void> {
    this.issues = await this.issueService.listIssues();

    if (this.contentWrapper === null) {
      this.renderAll();
      return;
    }

    const signature = this.computeFacetSignature();
    if (signature !== this.facetSignature) {
      this.facetSignature = signature;
      this.toolbar?.render({ issues: this.issues });
    }

    this.renderSummary();
    this.renderContent();
  }

  private renderAll(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('obsidian-issues-view');
    this.facetSignature = this.computeFacetSignature();

    const header = contentEl.createDiv({ cls: 'obsidian-issues-header' });
    header.createEl('h2', { text: 'Issues' });
    this.renderViewToggle(header);
    this.renderNewIssueButton(header);

    this.summaryEl = contentEl.createDiv({ cls: 'obsidian-issues-summary' });
    this.renderSummary();

    this.toolbarContainer = contentEl.createDiv({ cls: 'obsidian-issues-toolbar' });
    this.renderToolbar();

    this.contentWrapper = contentEl.createDiv({ cls: 'obsidian-issues-content' });
    this.renderContent();
  }

  private renderToolbar(): void {
    if (!this.toolbarContainer) return;

    if (this.toolbar) {
      this.toolbar.render({ issues: this.issues, viewMode: this.viewMode });
      return;
    }

    const deps: ToolbarDeps = {
      app: this.app,
      host: this.host,
      filters: this.filters,
      issues: this.issues,
      viewMode: this.viewMode,
      filteredCount: visibleCount(this.issues, this.filters).visible,
      totalCount: this.issues.length,
    };

    const callbacks: ToolbarCallbacks = {
      onFiltersChanged: () => {
        this.toolbar?.render({ issues: this.issues, viewMode: this.viewMode });
        this.renderContent();
      },
      onResetOrLayoutChange: () => {
        this.onResetOrLayoutChange();
      },
    };

    this.toolbar = new IssuesToolbar(this.toolbarContainer, deps, callbacks);
    this.toolbar.render();
  }

  private computeFacetSignature(): string {
    const sep = String.fromCharCode(0);
    const projects = new Set<string>();
    const labels = new Set<string>();
    for (const issue of this.issues) {
      if (issue.project.length > 0) projects.add(issue.project);
      for (const label of issue.labels) labels.add(label);
    }
    return `${[...projects].sort().join(sep)}|${[...labels].sort().join(sep)}`;
  }

  private renderNewIssueButton(header: HTMLElement): void {
    const newIssueButton = header.createEl('button', {
      text: '+ new issue',
      cls: 'mod-cta obsidian-issues-new-button',
      type: 'button',
    });

    newIssueButton.addEventListener('click', () => {
      void (async () => {
        newIssueButton.disabled = true;
        try {
          const [knownLabels, knownProjects] = await Promise.all([
            this.issueService.getAllLabels(),
            this.issueService.getAllProjects(),
          ]);

          new IssueModal(this.app, {
            title: 'New issue',
            initial: { priority: this.host.settings.defaultPriority },
            knownLabels,
            knownProjects,
            statusEditable: false,
            submitLabel: 'Create',
            onSubmit: async (data) => {
              const file = await this.issueService.createIssue(data);
              await this.app.workspace.getLeaf(false).openFile(file);
              new Notice(`Created ${file.basename}`);
            },
          }).open();
        } catch (error) {
          console.error('Vault Issues: failed to open new issue modal', error);
          new Notice('Could not create issue. Check the developer console.');
        } finally {
          newIssueButton.disabled = false;
        }
      })();
    });
  }

  private renderViewToggle(header: HTMLElement): void {
    const toggle = header.createDiv({
      cls: 'obsidian-issues-view-toggle',
      attr: { role: 'group', 'aria-label': 'Issue layout' },
    });

    const makeButton = (mode: IssueViewMode, text: string): HTMLElement => {
      const button = toggle.createEl('button', {
        text,
        cls: `obsidian-issues-view-toggle-button${this.viewMode === mode ? ' is-active' : ''}`,
        type: 'button',
        attr: { 'aria-pressed': String(this.viewMode === mode) },
      });
      button.addEventListener('click', () => {
        void this.setViewMode(mode);
      });
      return button;
    };

    this.listToggleButton = makeButton('list', 'List');
    this.kanbanToggleButton = makeButton('kanban', 'Kanban');
  }

  private updateViewToggle(): void {
    for (const [button, mode] of [
      [this.listToggleButton, 'list'] as const,
      [this.kanbanToggleButton, 'kanban'] as const,
    ]) {
      if (!button) continue;
      const active = this.viewMode === mode;
      button.toggleClass('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  applyLayoutFromSettings(): void {
    const mode = this.host.settings.viewMode;
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    if (mode === 'kanban') {
      this.filters.status = [];
    }
    this.updateViewToggle();
    this.toolbar?.render({ issues: this.issues, viewMode: mode });
    this.renderContent();
  }

  private async setViewMode(mode: IssueViewMode): Promise<void> {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    // The Kanban columns *are* the status axis, so a status filter there only
    // empties columns. Drop it when switching in.
    if (mode === 'kanban') {
      this.filters.status = [];
    }
    this.host.settings.viewMode = mode;
    await this.host.saveSettings();
    this.updateViewToggle();
    this.toolbar?.render({ issues: this.issues, viewMode: mode });
    this.renderContent();
  }

  private renderSummary(): void {
    if (!this.summaryEl) return;
    this.summaryEl.empty();

    for (const status of ISSUE_STATUSES) {
      const count = this.issues.filter((i) => i.status === status).length;
      const item = this.summaryEl.createSpan({ cls: 'obsidian-issues-summary-item' });
      item.createSpan({
        text: ISSUE_STATUS_LABELS[status],
        cls: `obsidian-issues-summary-label is-${status}`,
      });
      item.createSpan({ text: String(count), cls: 'obsidian-issues-summary-count' });
    }

    const total = this.issues.length;
    const item = this.summaryEl.createSpan({ cls: 'obsidian-issues-summary-item' });
    item.createSpan({ text: 'Total', cls: 'obsidian-issues-summary-label' });
    item.createSpan({ text: String(total), cls: 'obsidian-issues-summary-count' });

    if (hasActiveFilters(this.filters)) {
      const { visible, total: all } = visibleCount(this.issues, this.filters);
      const filteredItem = this.summaryEl.createSpan({ cls: 'obsidian-issues-summary-item' });
      filteredItem.createSpan({
        text: `Showing ${visible} of ${all}`,
        cls: 'obsidian-issues-summary-label',
      });
    }
  }

  private onResetOrLayoutChange(): void {
    Object.assign(this.filters, resetFilters(this.host.settings));
    this.facetSignature = this.computeFacetSignature();
    this.toolbar?.render();
    this.renderContent();
  }

  private renderContent(): void {
    if (!this.contentWrapper) return;

    const scroll = this.captureScroll();

    this.contentWrapper.empty();
    this.contentWrapper.toggleClass('is-kanban', this.viewMode === 'kanban');

    const visible = this.visibleIssues();

    if (this.viewMode === 'list') {
      this.list!.render(this.contentWrapper, visible);
    } else {
      this.kanban!.render(this.contentWrapper, visible);
    }

    this.restoreScroll(scroll);
    this.restoreFocus();
  }

  private visibleIssues(): Issue[] {
    return sortIssues(
      filterIssues(this.issues, this.filters),
      this.filters.sortBy,
      this.filters.sortDir,
    );
  }

  private captureScroll(): ScrollSnapshot {
    const columns: Record<string, number> = {};
    const wrapper = this.contentWrapper;

    if (wrapper) {
      wrapper
        .querySelectorAll<HTMLElement>('.obsidian-issues-kanban-column')
        .forEach((column) => {
          const status = column.dataset.status;
          const body = column.querySelector<HTMLElement>('.obsidian-issues-kanban-column-body');
          if (status !== undefined && body !== null) {
            columns[status] = body.scrollTop;
          }
        });
    }

    return {
      view: this.contentEl.scrollTop,
      board:
        wrapper?.querySelector<HTMLElement>('.obsidian-issues-kanban')?.scrollLeft ?? 0,
      columns,
    };
  }

  private restoreScroll(scroll: ScrollSnapshot): void {
    const wrapper = this.contentWrapper;
    if (!wrapper) return;

    const board = wrapper.querySelector<HTMLElement>('.obsidian-issues-kanban');
    if (board) board.scrollLeft = scroll.board;

    wrapper
      .querySelectorAll<HTMLElement>('.obsidian-issues-kanban-column')
      .forEach((column) => {
        const status = column.dataset.status;
        const body = column.querySelector<HTMLElement>('.obsidian-issues-kanban-column-body');
        const previous = status === undefined ? undefined : scroll.columns[status];
        if (body !== null && previous !== undefined) {
          body.scrollTop = previous;
        }
      });

    this.contentEl.scrollTop = scroll.view;
  }

  private restoreFocus(): void {
    const id = this.pendingFocusId;
    this.pendingFocusId = null;
    if (id === null) return;
    if (this.viewMode === 'kanban' && this.kanban) {
      this.kanban.restoreFocus(id);
    }
  }
}
