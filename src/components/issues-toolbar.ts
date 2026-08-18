import { App, DropdownComponent, TextComponent } from 'obsidian';
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
} from '../constants.ts';
import { applyLabelColor } from '../labels.ts';
import {
  type FilterState,
  hasActiveFilters,
} from '../filters/issue-filter.ts';
import type { IssuesViewHost } from '../config/settings.ts';
import type { Issue, IssuePriority, IssueStatus } from '../types.ts';

const SEARCH_DEBOUNCE_MS = 180;

interface DropdownState {
  button: HTMLElement;
  panel: HTMLElement;
  open: boolean;
}

export interface ToolbarDeps {
  app: App;
  host: IssuesViewHost;
  filters: FilterState;
  issues: Issue[];
  viewMode: 'list' | 'kanban';
  filteredCount: number;
  totalCount: number;
}

export interface ToolbarCallbacks {
  onFiltersChanged: () => void;
  onResetOrLayoutChange: () => void;
}

export class IssuesToolbar {
  private dropdownStates: Map<string, DropdownState> = new Map();
  private searchDebounce: number | null = null;
  private documentClickHandler: (e: MouseEvent) => void;

  constructor(
    private readonly container: HTMLElement,
    private deps: ToolbarDeps,
    private readonly callbacks: ToolbarCallbacks,
  ) {
    this.documentClickHandler = (e: MouseEvent) => this.handleDocumentClick(e);
    document.addEventListener('click', this.documentClickHandler);
  }

  render(updatedDeps?: Partial<ToolbarDeps>): void {
    if (updatedDeps) {
      this.deps = { ...this.deps, ...updatedDeps };
    }
    this.dropdownStates.clear();
    this.container.empty();
    this.container.toggleClass('is-active-filters', hasActiveFilters(this.deps.filters));

    const { filters, issues, viewMode } = this.deps;

    const search = new TextComponent(this.container);
    search.setPlaceholder('Search issues…').setValue(filters.search);
    search.inputEl.addClass('obsidian-issues-search');
    search.inputEl.type = 'search';
    search.inputEl.setAttribute('aria-label', 'Search issues');
    search.onChange((value) => {
      filters.search = value;
      if (this.searchDebounce !== null) {
        window.clearTimeout(this.searchDebounce);
      }
      this.searchDebounce = window.setTimeout(() => {
        this.searchDebounce = null;
        this.callbacks.onFiltersChanged();
      }, SEARCH_DEBOUNCE_MS);
    });

    if (viewMode === 'list') {
      this.renderFilterDropdown(
        this.container,
        'status',
        'Status',
        ISSUE_STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_LABELS[s] })),
        () => filters.status,
        (value) => {
          filters.status = toggleInArray(filters.status, value as IssueStatus);

          this.callbacks.onFiltersChanged();
        },
      );
    }

    const knownProjects = Array.from(
      new Set(issues.map((i) => i.project).filter((p) => p.length > 0)),
    ).sort();
    if (knownProjects.length > 0) {
      this.renderFilterDropdown(
        this.container,
        'project',
        'Project',
        knownProjects.map((p) => ({ value: p, label: p })),
        () => filters.project,
        (value) => {
          filters.project = toggleInArray(filters.project, value);
          this.callbacks.onFiltersChanged();
        },
      );
    }

    this.renderFilterDropdown(
      this.container,
      'priority',
      'Priority',
      ISSUE_PRIORITIES.map((p) => ({ value: p, label: ISSUE_PRIORITY_LABELS[p] })),
      () => filters.priority,
      (value) => {
        filters.priority = toggleInArray(filters.priority, value as IssuePriority);
        this.callbacks.onFiltersChanged();
      },
    );

    const labelSet = new Set<string>();
    for (const issue of issues) {
      for (const label of issue.labels) {
        labelSet.add(label);
      }
    }
    const knownLabels = [...labelSet].sort();
    if (knownLabels.length > 0) {
      this.renderFilterDropdown(
        this.container,
        'labels',
        'Labels',
        knownLabels.map((l) => ({ value: l, label: l, colored: true })),
        () => filters.labels,
        (value) => {
          filters.labels = toggleInArray(filters.labels, value);
          this.callbacks.onFiltersChanged();
        },
        () => {
          filters.labels = [];
          this.callbacks.onFiltersChanged();
        },
      );
    }

    const sortDropdown = new DropdownComponent(this.container);
    sortDropdown.addOption('created-desc', 'Created ↓');
    sortDropdown.addOption('created-asc', 'Created ↑');
    sortDropdown.addOption('due-asc', 'Due soonest');
    sortDropdown.addOption('due-desc', 'Due latest');
    sortDropdown.addOption('priority-desc', 'Priority ↓');
    sortDropdown.addOption('priority-asc', 'Priority ↑');
    sortDropdown.selectEl.setAttribute('aria-label', 'Sort issues');
    sortDropdown.setValue(`${filters.sortBy}-${filters.sortDir}`);
    sortDropdown.onChange((value) => {
      const [sortBy, sortDir] = value.split('-') as [
        'created' | 'due' | 'priority',
        'asc' | 'desc',
      ];
      filters.sortBy = sortBy;
      filters.sortDir = sortDir;
      this.callbacks.onFiltersChanged();
    });

    const hasActive = hasActiveFilters(this.deps.filters);
    const resetButton = this.container.createEl('button', {
      text: 'Reset filters',
      cls: `obsidian-issues-clear-all${hasActive ? ' is-active' : ''}`,
      type: 'button',
    });
    resetButton.addEventListener('click', () => {
      this.callbacks.onResetOrLayoutChange();
    });
  }

  closeAllDropdowns(): void {
    for (const [, state] of this.dropdownStates) {
      this.setDropdownOpen(state, false);
    }
  }

  destroy(): void {
    if (this.searchDebounce !== null) {
      window.clearTimeout(this.searchDebounce);
      this.searchDebounce = null;
    }
    this.dropdownStates.clear();
    document.removeEventListener('click', this.documentClickHandler);
  }

  private handleDocumentClick = (e: MouseEvent): void => {
    if (!(e.target instanceof Node)) return;
    for (const [, state] of this.dropdownStates) {
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
      const rect = state.panel.getBoundingClientRect();
      state.panel.toggleClass('is-flipped', rect.right > window.innerWidth);
    } else {
      state.panel.removeClass('is-flipped');
    }
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
    this.dropdownStates.set(name, state);

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setDropdownOpen(state, !state.open);
    });

    const syncButton = (): void => {
      const current = getSelected();
      button.textContent = current.length > 0 ? `${labelText} (${current.length})` : labelText;
      button.toggleClass('is-filtering', current.length > 0);
    };

    for (const opt of options) {
      const isActive = getSelected().includes(opt.value);
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
      optionButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleValue(opt.value);
        const nowActive = getSelected().includes(opt.value);
        optionButton.toggleClass('is-active', nowActive);
        optionButton.setAttribute('aria-pressed', String(nowActive));
        syncButton();
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
      });
    }
  }
}

function toggleInArray<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
