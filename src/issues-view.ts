import {
  DropdownComponent,
  ItemView,
  Notice,
  TFile,
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
import { ConfirmModal } from './confirm-modal';
import {
  compareDueDates,
  compareIsoDates,
  dueState,
  dueVariant,
  toDisplayDate,
  toIsoDate,
} from './dates';
import { IssueModal } from './issue-modal';
import { applyLabelColor } from './labels';
import type { IssuesViewHost, IssueViewMode } from './settings';
import type { Issue, IssuePriority, IssueStatus } from './types';
import type { IssueService } from './issue-service';

const SEARCH_DEBOUNCE_MS = 180;

interface FilterState {
  search: string;
  status: IssueStatus[];
  project: string[];
  priority: IssuePriority[];
  labels: string[];
  sortBy: 'created' | 'due' | 'priority';
  sortDir: 'asc' | 'desc';
}

interface DropdownState {
  button: HTMLElement;
  panel: HTMLElement;
  open: boolean;
}

interface ScrollSnapshot {
  view: number;
  board: number;
  columns: Record<string, number>;
}

export class IssuesView extends ItemView {
  private issues: Issue[] = [];
  private summaryEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  private contentWrapper: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private viewMode: IssueViewMode;
  private filters: FilterState;

  private dropdowns: Map<string, DropdownState> = new Map();
  private listToggleButton: HTMLElement | null = null;
  private kanbanToggleButton: HTMLElement | null = null;
  private searchDebounce: number | null = null;
  /** Facet signature, so the toolbar is only rebuilt when its options change. */
  private facetSignature = '';
  /** Set between dragstart and dragend so the trailing click doesn't open a note. */
  private draggingId: string | null = null;
  private lastDragEnd = 0;
  /** Issue to re-focus after the next repaint. */
  private pendingFocusId: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly issueService: IssueService,
    private readonly host: IssuesViewHost,
  ) {
    super(leaf);
    this.navigation = false;
    this.viewMode = host.settings.viewMode;
    this.filters = {
      search: '',
      status: [],
      project: [],
      priority: [],
      labels: [],
      sortBy: host.settings.defaultSortBy,
      sortDir: host.settings.defaultSortDir,
    };
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
    // Registered once for the lifetime of the view; Obsidian removes it on
    // unload. Previously this was added and removed on every refresh.
    this.registerDomEvent(document, 'click', this.handleDocumentClick);
    await this.refresh();
  }

  protected async onClose(): Promise<void> {
    if (this.searchDebounce !== null) {
      window.clearTimeout(this.searchDebounce);
      this.searchDebounce = null;
    }
    this.dropdowns.clear();
  }

  /**
   * Full rebuild: header, summary, toolbar and content.
   *
   * The issues are loaded *before* any DOM is touched, so `renderAll` runs to
   * completion synchronously. Awaiting halfway through the build let two
   * concurrent refreshes interleave — the second emptied `contentEl` while the
   * first was suspended, and the first then appended a second toolbar to it.
   */
  async refresh(): Promise<void> {
    this.issues = await this.issueService.listIssues();
    this.renderAll();
  }

  /**
   * Re-reads the issues and repaints the summary and content, leaving the
   * toolbar DOM alone unless its options actually changed. A full rebuild on
   * every vault event destroyed the search box mid-keystroke.
   */
  async reload(): Promise<void> {
    this.issues = await this.issueService.listIssues();

    if (this.contentWrapper === null) {
      this.renderAll();
      return;
    }

    const signature = this.computeFacetSignature();
    if (signature !== this.facetSignature) {
      this.facetSignature = signature;
      this.rebuildToolbar();
    }

    this.renderSummary();
    this.renderContent();
  }

  private renderAll(): void {
    const { contentEl } = this;
    this.dropdowns.clear();
    contentEl.empty();
    contentEl.addClass('obsidian-issues-view');
    this.facetSignature = this.computeFacetSignature();

    const header = contentEl.createDiv({ cls: 'obsidian-issues-header' });
    header.createEl('h2', { text: 'Issues' });
    this.renderViewToggle(header);
    this.renderNewIssueButton(header);

    this.summaryEl = contentEl.createDiv({ cls: 'obsidian-issues-summary' });
    this.renderSummary();

    this.toolbarEl = contentEl.createDiv({ cls: 'obsidian-issues-toolbar' });
    this.renderToolbar();

    this.contentWrapper = contentEl.createDiv({ cls: 'obsidian-issues-content' });
    this.renderContent();
  }

  private computeFacetSignature(): string {
    const projects = new Set<string>();
    const labels = new Set<string>();
    for (const issue of this.issues) {
      if (issue.project.length > 0) projects.add(issue.project);
      for (const label of issue.labels) labels.add(label);
    }
    // NUL-separated: joined on a space, the two projects "a" and "b" would be
    // indistinguishable from the single project "a b".
    return `${[...projects].sort().join('\u0000')}|${[...labels].sort().join('\u0000')}`;
  }

  private handleDocumentClick = (e: MouseEvent): void => {
    if (!(e.target instanceof Node)) return;
    for (const [, state] of this.dropdowns) {
      if (state.open && !state.button.contains(e.target) && !state.panel.contains(e.target)) {
        this.setDropdownOpen(state, false);
      }
    }
  };

  private setDropdownOpen(state: DropdownState, open: boolean): void {
    state.open = open;
    state.panel.toggleClass('is-hidden', !open);
    state.button.setAttribute('aria-expanded', String(open));

    if (open) {
      // Flip to right-aligned if the panel would overflow the viewport.
      const rect = state.panel.getBoundingClientRect();
      state.panel.toggleClass('is-flipped', rect.right > window.innerWidth);
    } else {
      state.panel.removeClass('is-flipped');
    }
  }

  private renderNewIssueButton(header: HTMLElement): void {
    const newIssueButton = header.createEl('button', {
      text: '+ New issue',
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
          console.error('Obsidian Issues: failed to open new issue modal', error);
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

  /**
   * Adopts the layout currently stored in settings. Used by the "Toggle list /
   * Kanban layout" command, which changes the setting from outside the view —
   * without this the command silently did nothing to an already-open view.
   */
  applyLayoutFromSettings(): void {
    const mode = this.host.settings.viewMode;
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    if (mode === 'kanban') {
      this.filters.status = [];
    }
    this.updateViewToggle();
    this.rebuildToolbar();
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
    this.rebuildToolbar();
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
  }

  private rebuildToolbar(): void {
    if (!this.toolbarEl) return;
    this.dropdowns.clear();
    this.toolbarEl.empty();
    this.renderToolbar();
  }

  private renderToolbar(): void {
    const container = this.toolbarEl;
    if (!container) return;

    const search = new TextComponent(container);
    search.setPlaceholder('Search issues…').setValue(this.filters.search);
    search.inputEl.addClass('obsidian-issues-search');
    search.inputEl.type = 'search';
    search.inputEl.setAttribute('aria-label', 'Search issues');
    search.onChange((value) => {
      // The filter is updated synchronously and only the repaint is debounced.
      // Debouncing the assignment too meant a toolbar rebuild landing mid-type
      // could restore the previous query and discard what was typed.
      this.filters.search = value;
      if (this.searchDebounce !== null) {
        window.clearTimeout(this.searchDebounce);
      }
      this.searchDebounce = window.setTimeout(() => {
        this.searchDebounce = null;
        this.renderContent();
      }, SEARCH_DEBOUNCE_MS);
    });

    if (this.viewMode === 'list') {
      this.renderFilterDropdown(
        container,
        'status',
        'Status',
        ISSUE_STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_LABELS[s] })),
        () => this.filters.status,
        (value) => {
          this.filters.status = toggleInArray(this.filters.status, value as IssueStatus);
        },
      );
    }

    const knownProjects = Array.from(
      new Set(this.issues.map((i) => i.project).filter((p) => p.length > 0)),
    ).sort();
    if (knownProjects.length > 0) {
      this.renderFilterDropdown(
        container,
        'project',
        'Project',
        knownProjects.map((p) => ({ value: p, label: p })),
        () => this.filters.project,
        (value) => {
          this.filters.project = toggleInArray(this.filters.project, value);
        },
      );
    }

    this.renderFilterDropdown(
      container,
      'priority',
      'Priority',
      ISSUE_PRIORITIES.map((p) => ({ value: p, label: ISSUE_PRIORITY_LABELS[p] })),
      () => this.filters.priority,
      (value) => {
        this.filters.priority = toggleInArray(this.filters.priority, value as IssuePriority);
      },
    );

    const labelSet = new Set<string>();
    for (const issue of this.issues) {
      for (const label of issue.labels) {
        labelSet.add(label);
      }
    }
    const knownLabels = [...labelSet].sort();
    if (knownLabels.length > 0) {
      this.renderFilterDropdown(
        container,
        'labels',
        'Labels',
        knownLabels.map((l) => ({ value: l, label: l, colored: true })),
        () => this.filters.labels,
        (value) => {
          this.filters.labels = toggleInArray(this.filters.labels, value);
        },
        () => {
          this.filters.labels = [];
        },
      );
    }

    const sortDropdown = new DropdownComponent(container);
    sortDropdown.addOption('created-desc', 'Created ↓');
    sortDropdown.addOption('created-asc', 'Created ↑');
    sortDropdown.addOption('due-asc', 'Due soonest');
    sortDropdown.addOption('due-desc', 'Due latest');
    sortDropdown.addOption('priority-desc', 'Priority ↓');
    sortDropdown.addOption('priority-asc', 'Priority ↑');
    sortDropdown.selectEl.setAttribute('aria-label', 'Sort issues');
    sortDropdown.setValue(`${this.filters.sortBy}-${this.filters.sortDir}`);
    sortDropdown.onChange((value) => {
      const [sortBy, sortDir] = value.split('-') as ['created' | 'due' | 'priority', 'asc' | 'desc'];
      this.filters.sortBy = sortBy;
      this.filters.sortDir = sortDir;
      this.renderContent();
    });

    const resetButton = container.createEl('button', {
      text: 'Reset filters',
      cls: 'obsidian-issues-clear-all',
      type: 'button',
    });
    resetButton.addEventListener('click', () => {
      this.resetAllFilters();
      this.rebuildToolbar();
      this.renderContent();
    });
  }

  private resetAllFilters(): void {
    this.filters = {
      search: '',
      status: [],
      project: [],
      priority: [],
      labels: [],
      sortBy: this.host.settings.defaultSortBy,
      sortDir: this.host.settings.defaultSortDir,
    };
  }

  private renderFilterDropdown(
    container: HTMLElement,
    name: string,
    labelText: string,
    options: { value: string; label: string; colored?: boolean }[],
    getSelected: () => string[],
    toggleValue: (value: string) => void,
    clearAll?: () => void,
  ): void {
    const wrapper = container.createDiv({
      cls: 'obsidian-issues-filter-dropdown-wrapper',
    });
    const selected = getSelected();
    const button = wrapper.createEl('button', {
      text: selected.length > 0 ? `${labelText} (${selected.length})` : labelText,
      cls: `obsidian-issues-label-dropdown${selected.length > 0 ? ' is-filtering' : ''}`,
      type: 'button',
      attr: { 'aria-expanded': 'false', 'aria-haspopup': 'true' },
    });
    const panel = wrapper.createDiv({
      cls: 'obsidian-issues-label-dropdown-panel is-hidden',
      attr: { role: 'group', 'aria-label': `${labelText} filter` },
    });

    const state: DropdownState = { button, panel, open: false };
    this.dropdowns.set(name, state);

    button.addEventListener('click', () => {
      this.setDropdownOpen(state, !state.open);
    });

    const syncButton = (): void => {
      const current = getSelected();
      button.textContent = current.length > 0 ? `${labelText} (${current.length})` : labelText;
      button.toggleClass('is-filtering', current.length > 0);
    };

    for (const opt of options) {
      const isActive = getSelected().includes(opt.value);
      // A real <button> rather than a <span>, so the options are reachable and
      // operable from the keyboard.
      const optionButton = panel.createEl('button', {
        text: opt.label,
        cls: `obsidian-issues-label-filter${isActive ? ' is-active' : ''}`,
        type: 'button',
        attr: { 'aria-pressed': String(isActive) },
      });
      if (opt.colored === true) {
        optionButton.addClass('is-colored');
        applyLabelColor(optionButton, opt.value);
      }
      optionButton.addEventListener('click', () => {
        toggleValue(opt.value);
        const nowActive = getSelected().includes(opt.value);
        optionButton.toggleClass('is-active', nowActive);
        optionButton.setAttribute('aria-pressed', String(nowActive));
        syncButton();
        this.renderContent();
      });
    }

    if (clearAll) {
      panel.createEl('hr', { cls: 'obsidian-issues-clear-divider' });
      const clearBtn = panel.createEl('button', {
        text: `Clear ${labelText.toLowerCase()}`,
        cls: 'obsidian-issues-clear-labels',
        type: 'button',
      });
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearAll();
        panel.querySelectorAll('.obsidian-issues-label-filter.is-active').forEach((el) => {
          el.classList.remove('is-active');
          el.setAttribute('aria-pressed', 'false');
        });
        syncButton();
        this.setDropdownOpen(state, false);
        this.renderContent();
      });
    }
  }

  /**
   * Repaints the list or board.
   *
   * Scroll offsets are captured first and reapplied afterwards. Emptying the
   * wrapper collapses its height to zero, at which point the browser clamps
   * every enclosing scroller to the top — so moving a card used to throw the
   * reader back to the start of the board.
   */
  private renderContent(): void {
    if (!this.contentWrapper) return;

    const scroll = this.captureScroll();

    this.contentWrapper.empty();
    this.contentWrapper.toggleClass('is-kanban', this.viewMode === 'kanban');

    if (this.viewMode === 'list') {
      this.listEl = this.contentWrapper.createDiv({ cls: 'obsidian-issues-list' });
      this.renderList();
    } else {
      this.listEl = null;
      this.renderKanban();
    }

    this.restoreScroll(scroll);
    this.restoreFocus();
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

  /**
   * Returns focus to the card or row that was just acted on, so repeated
   * keyboard moves (Ctrl/Cmd + arrow) keep working on the same issue.
   */
  private restoreFocus(): void {
    const id = this.pendingFocusId;
    this.pendingFocusId = null;
    if (id === null || !this.contentWrapper) return;

    const target = this.contentWrapper.querySelector<HTMLElement>(
      `.obsidian-issues-kanban-card[data-issue-id="${CSS.escape(id)}"]`,
    );
    target?.focus();
  }

  private visibleIssues(): Issue[] {
    return this.applySort(this.applyFilters(this.issues));
  }

  private renderList(): void {
    if (!this.listEl) return;

    const sorted = this.visibleIssues();

    if (sorted.length === 0) {
      this.renderEmptyState(this.listEl);
      return;
    }

    for (const issue of sorted) {
      this.renderIssueRow(issue);
    }
  }

  private renderEmptyState(container: HTMLElement): void {
    const hasFilters = this.hasActiveFilters();
    const empty = container.createDiv({ cls: 'obsidian-issues-empty' });
    empty.createSpan({
      text: hasFilters
        ? 'No issues match your filters.'
        : 'No issues yet. Create one with “+ New issue”.',
    });
    if (hasFilters) {
      const reset = empty.createEl('button', {
        text: 'Reset filters',
        cls: 'obsidian-issues-empty-reset',
        type: 'button',
      });
      reset.addEventListener('click', () => {
        this.resetAllFilters();
        this.rebuildToolbar();
        this.renderContent();
      });
    }
  }

  private hasActiveFilters(): boolean {
    return (
      this.filters.search.length > 0 ||
      this.filters.status.length > 0 ||
      this.filters.project.length > 0 ||
      this.filters.priority.length > 0 ||
      this.filters.labels.length > 0
    );
  }

  /**
   * Status groups are always rendered, even when empty — otherwise there is
   * nothing to drop a card onto, and a fresh vault shows no board structure
   * at all.
   */
  private renderKanban(): void {
    if (!this.contentWrapper) return;

    const sorted = this.visibleIssues();
    // The columns need a flex row of their own; the content wrapper is shared
    // with the list layout.
    const board = this.contentWrapper.createDiv({ cls: 'obsidian-issues-kanban' });

    for (const status of ISSUE_STATUSES) {
      this.renderKanbanColumn(board, status, sorted.filter((i) => i.status === status));
    }

    if (sorted.length === 0 && this.hasActiveFilters()) {
      this.renderEmptyState(this.contentWrapper);
    }
  }

  private renderKanbanColumn(
    board: HTMLElement,
    status: IssueStatus,
    issues: Issue[],
  ): void {
    // An aria-label needs a role to be announced; on a bare div it is ignored.
    const column = board.createDiv({
      cls: 'obsidian-issues-kanban-column',
      attr: { role: 'group', 'aria-label': `${ISSUE_STATUS_LABELS[status]} column` },
    });
    column.dataset.status = status;

    const header = column.createDiv({
      cls: 'obsidian-issues-kanban-column-header',
    });
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
      // Carries `listitem` so it isn't an invalid non-item child of the list.
      body.createDiv({
        text: 'Drop issues here',
        cls: 'obsidian-issues-kanban-column-empty',
        attr: { role: 'listitem' },
      });
    } else {
      for (const issue of issues) {
        this.renderKanbanCard(issue, body);
      }
    }

    column.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      column.addClass('is-drag-over');
    });
    column.addEventListener('dragleave', (e: DragEvent) => {
      // Ignore the dragleave fired when moving between the column's children.
      if (e.relatedTarget instanceof Node && column.contains(e.relatedTarget)) return;
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
    topLine.createSpan({
      text: shortIssueId(issue.id),
      cls: 'obsidian-issues-kanban-card-id',
    });
    const cardTitle = topLine.createEl('button', {
      text: issue.title,
      cls: 'obsidian-issues-kanban-card-title',
      type: 'button',
    });
    cardTitle.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.openIssue(issue);
    });

    const actions = topLine.createDiv({ cls: 'obsidian-issues-card-buttons' });
    const editBtn = actions.createEl('button', {
      cls: 'obsidian-issues-edit-button',
      type: 'button',
      attr: { 'aria-label': `Edit ${issue.title}` },
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.editIssue(issue);
    });

    const deleteBtn = actions.createEl('button', {
      cls: 'obsidian-issues-delete-button mod-warning',
      type: 'button',
      attr: { 'aria-label': `Delete ${issue.title}` },
    });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.deleteIssue(issue);
    });

    const meta = card.createDiv({ cls: 'obsidian-issues-kanban-card-meta' });
    meta.createSpan({
      text: ISSUE_PRIORITY_LABELS[issue.priority].toUpperCase(),
      cls: `obsidian-issues-priority is-${issue.priority}`,
    });
    this.renderDue(meta, issue);
    this.renderLabels(meta, issue);
    this.renderSourceLink(meta, issue);

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
      // A cancelled drag can be followed by a click on the source card. The
      // timestamp guard covers browsers that dispatch that click in a later
      // task, where clearing a flag on `dragend` alone would come too late.
      if (this.draggingId !== null || Date.now() - this.lastDragEnd < 200) return;
      void this.openIssue(issue);
    });
    card.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void this.openIssue(issue);
        return;
      }
      // Keyboard equivalent of dragging a card between columns.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const index = ISSUE_STATUSES.indexOf(issue.status);
        const target = ISSUE_STATUSES[index + (e.key === 'ArrowRight' ? 1 : -1)];
        if (target) void this.updateIssueStatus(issue, target, true);
      }
    });
  }

  private renderIssueRow(issue: Issue): void {
    const row = this.listEl!.createDiv({ cls: 'obsidian-issues-row' });
    row.addClass(`is-status-${issue.status}`);

    // The edge marker follows the same rule as the due-date text: a closed
    // issue is never flagged as overdue.
    if (issue.status !== 'closed') {
      const state = dueState(issue.due);
      if (state === 'today') row.addClass('is-due-today');
      if (state === 'overdue') row.addClass('is-overdue');
    }

    const topLine = row.createDiv({ cls: 'obsidian-issues-row-top' });

    // A real button: the status control is interactive, so it needs to be
    // focusable and announced as such.
    const statusButton = topLine.createEl('button', {
      cls: `obsidian-issues-status-dot is-${issue.status}`,
      type: 'button',
      attr: {
        'aria-label': `${issue.title} is ${ISSUE_STATUS_LABELS[issue.status].toLowerCase()}. Change status.`,
      },
    });
    // The glyph is decorative; the button's aria-label already carries the state.
    statusButton.createSpan({
      text: STATUS_GLYPHS[issue.status],
      attr: { 'aria-hidden': 'true' },
    });
    statusButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.cycleStatus(issue);
    });

    // The row itself is a plain div. It used to be role="button" with two
    // nested <button>s inside it, which is invalid and made the row's own
    // action ambiguous to assistive tech.
    const titleButton = topLine.createEl('button', {
      text: issue.title,
      cls: 'obsidian-issues-title',
      type: 'button',
    });
    titleButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.openIssue(issue);
    });

    topLine.createSpan({
      text: ISSUE_PRIORITY_LABELS[issue.priority].toUpperCase(),
      cls: `obsidian-issues-priority is-${issue.priority}`,
    });

    const buttonGroup = topLine.createDiv({ cls: 'obsidian-issues-row-buttons' });

    const editButton = buttonGroup.createEl('button', {
      cls: 'obsidian-issues-edit-button',
      type: 'button',
      attr: { 'aria-label': `Edit ${issue.title}` },
    });
    setIcon(editButton, 'pencil');
    editButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.editIssue(issue);
    });

    const deleteButton = buttonGroup.createEl('button', {
      cls: 'obsidian-issues-delete-button mod-warning',
      type: 'button',
      attr: { 'aria-label': `Delete ${issue.title}` },
    });
    setIcon(deleteButton, 'trash-2');
    deleteButton.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void this.deleteIssue(issue);
    });

    const meta = row.createDiv({ cls: 'obsidian-issues-meta' });
    meta.createSpan({ text: shortIssueId(issue.id), cls: 'obsidian-issues-issue-id' });
    if (issue.project) {
      meta.createSpan({ text: issue.project, cls: 'obsidian-issues-project' });
    }
    this.renderLabels(meta, issue);
    this.renderDue(meta, issue);
    this.renderSourceLink(meta, issue);

    row.addEventListener('click', () => {
      void this.openIssue(issue);
    });
  }

  private renderLabels(meta: HTMLElement, issue: Issue): void {
    if (issue.labels.length === 0) return;
    const labelsContainer = meta.createDiv({ cls: 'obsidian-issues-labels' });
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
  private renderDue(meta: HTMLElement, issue: Issue): void {
    const variant = dueVariant(issue.due, issue.status === 'closed');
    if (variant === 'none') return;

    if (variant === 'invalid') {
      meta.createSpan({
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

    meta.createSpan({
      text: label,
      cls: `obsidian-issues-due is-${variant}`,
      attr:
        variant === 'done' && dueState(issue.due) === 'overdue'
          ? { title: 'Was past its due date when closed' }
          : {},
    });
  }

  private renderSourceLink(meta: HTMLElement, issue: Issue): void {
    if (!issue.source) return;
    const name = issue.source.replace(/\.md$/, '').split('/').pop() ?? issue.source;
    const sourceLink = meta.createEl('a', {
      text: name,
      cls: 'obsidian-issues-source-link',
      attr: { href: '#', title: issue.source, 'aria-label': `Open source note ${name}` },
    });
    sourceLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceFile = this.app.vault.getAbstractFileByPath(issue.source);
      if (sourceFile instanceof TFile) {
        void this.app.workspace.getLeaf(false).openFile(sourceFile);
      } else {
        new Notice('Source note not found.');
      }
    });
  }

  private applyFilters(issues: Issue[]): Issue[] {
    const query = this.filters.search.trim().toLowerCase();

    return issues.filter((issue) => {
      if (query.length > 0) {
        const haystack = [
          issue.title,
          issue.body,
          issue.project,
          shortIssueId(issue.id),
          issue.id,
          ...issue.labels,
        ]
          .join('\n')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (this.filters.status.length > 0 && !this.filters.status.includes(issue.status)) {
        return false;
      }
      if (this.filters.project.length > 0 && !this.filters.project.includes(issue.project)) {
        return false;
      }
      if (this.filters.priority.length > 0 && !this.filters.priority.includes(issue.priority)) {
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

      if (sortBy === 'due') {
        // Undated issues sort last in *both* directions, so this comparison
        // deliberately happens outside the direction multiplier.
        const aEmpty = toIsoDate(a.due).length === 0;
        const bEmpty = toIsoDate(b.due).length === 0;
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        compareValue = compareDueDates(a.due, b.due);
      } else if (sortBy === 'created') {
        compareValue = compareIsoDates(a.created, b.created);
      } else {
        compareValue =
          ISSUE_PRIORITIES.indexOf(a.priority) - ISSUE_PRIORITIES.indexOf(b.priority);
      }

      if (compareValue === 0) {
        return a.id.localeCompare(b.id, undefined, { numeric: true }) * multiplier;
      }

      return compareValue * multiplier;
    });
  }

  private async openIssue(issue: Issue): Promise<void> {
    await this.app.workspace.getLeaf(false).openFile(issue.file);
  }

  private async deleteIssue(issue: Issue): Promise<void> {
    if (this.host.settings.confirmDelete) {
      const confirmed = await ConfirmModal.show(this.app, {
        title: 'Delete issue',
        message: `Move “${issue.title}” (${shortIssueId(issue.id)}) to the trash?`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!confirmed) return;
    }

    try {
      await this.issueService.unlinkIssueFromNote(issue.id, issue.source);
      await this.issueService.deleteIssue(issue.file);
      new Notice(`Deleted ${issue.file.basename}`);
      await this.reload();
    } catch (error) {
      console.error('Obsidian Issues: failed to delete issue', error);
      new Notice('Could not delete issue. Check the developer console.');
    }
  }

  private async cycleStatus(issue: Issue): Promise<void> {
    try {
      const status = await this.issueService.cycleIssueStatus(issue.file);
      new Notice(`${shortIssueId(issue.id)} → ${ISSUE_STATUS_LABELS[status].toLowerCase()}`);
      await this.reload();
    } catch (error) {
      console.error('Obsidian Issues: failed to change status', error);
      new Notice('Could not update issue. Check the developer console.');
    }
  }

  private async updateIssueStatus(
    issue: Issue,
    status: IssueStatus,
    keepFocus = false,
  ): Promise<void> {
    try {
      if (keepFocus) this.pendingFocusId = issue.id;
      await this.issueService.updateIssue(issue.file, { status });
      await this.reload();
    } catch (error) {
      console.error('Obsidian Issues: failed to update issue status', error);
      new Notice('Could not update issue. Check the developer console.');
    }
  }

  private async editIssue(issue: Issue): Promise<void> {
    try {
      const [knownLabels, knownProjects] = await Promise.all([
        this.issueService.getAllLabels(),
        this.issueService.getAllProjects(),
      ]);

      new IssueModal(this.app, {
        title: `Edit ${shortIssueId(issue.id)}`,
        initial: issue,
        knownLabels,
        knownProjects,
        statusEditable: true,
        submitLabel: 'Save',
        onSubmit: async (data) => {
          await this.issueService.updateIssue(issue.file, data);
          await this.reload();
        },
      }).open();
    } catch (error) {
      console.error('Obsidian Issues: failed to open edit modal', error);
      new Notice('Could not open issue. Check the developer console.');
    }
  }
}

const STATUS_GLYPHS: Record<IssueStatus, string> = {
  open: '●',
  'in-progress': '◐',
  closed: '○',
};

function toggleInArray<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function shortIssueId(id: string): string {
  const match = id.match(/^[A-Z0-9_]+-(\d+)$/i);
  return match && match[1] !== undefined ? `#${parseInt(match[1], 10)}` : id;
}
