import {
  App,
  DropdownComponent,
  Modal,
  Notice,
  TextComponent,
} from 'obsidian';
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
} from './constants.ts';
import { isValidDate, toDisplayDate, toIsoDate } from './dates.ts';
import { TagInput } from './tag-input.ts';
import type { IssueData, IssuePriority, IssueStatus } from './types.ts';

export interface IssueModalOptions {
  title: string;
  initial: Partial<IssueData>;
  knownLabels: string[];
  knownProjects: string[];
  statusEditable: boolean;
  submitLabel: string;
  onSubmit: (data: IssueData) => void | Promise<void>;
}

export class IssueModal extends Modal {
  private titleInput!: TextComponent;
  private statusDropdown: DropdownComponent | null = null;
  private priorityDropdown!: DropdownComponent;
  private projectInput!: TextComponent;
  private tagInput!: TagInput;
  private dueInput!: HTMLInputElement;
  private submitButton: HTMLButtonElement | null = null;
  private submitting = false;

  constructor(app: App, private options: IssueModalOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(this.options.title);

    // Add class to both the modal element and contentEl for CSS targeting
    this.modalEl.addClass('obsidian-issues-modal-content');
    contentEl.addClass('obsidian-issues-modal-content');
    const form = contentEl.createDiv({ cls: 'obsidian-issues-form' });

    const titleRow = form.createDiv({ cls: 'obsidian-issues-field' });
    titleRow.createEl(
      'label',
      { text: 'Title', cls: 'obsidian-issues-field-label' },
      (label) => {
        label.htmlFor = 'obsidian-issues-title-input';
      },
    );
    this.titleInput = new TextComponent(
      titleRow.createDiv({ cls: 'obsidian-issues-field-input' }),
    );
    this.titleInput.inputEl.id = 'obsidian-issues-title-input';
    this.titleInput
      .setPlaceholder('Enter issue title')
      .setValue(this.options.initial.title ?? '');
    this.titleInput.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleSubmit();
      }
    });

    if (this.options.statusEditable) {
      const statusRow = form.createDiv({ cls: 'obsidian-issues-field' });
      statusRow.createEl(
        'label',
        { text: 'Status', cls: 'obsidian-issues-field-label' },
        (label) => {
          label.htmlFor = 'obsidian-issues-status-input';
        },
      );
      this.statusDropdown = new DropdownComponent(
        statusRow.createDiv({ cls: 'obsidian-issues-field-input' }),
      );
      this.statusDropdown.selectEl.id = 'obsidian-issues-status-input';
      for (const status of ISSUE_STATUSES) {
        this.statusDropdown.addOption(status, ISSUE_STATUS_LABELS[status]);
      }
      this.statusDropdown.setValue(this.options.initial.status ?? 'open');
    }

    const priorityRow = form.createDiv({ cls: 'obsidian-issues-field' });
    priorityRow.createEl(
      'label',
      { text: 'Priority', cls: 'obsidian-issues-field-label' },
      (label) => {
        label.htmlFor = 'obsidian-issues-priority-input';
      },
    );
    this.priorityDropdown = new DropdownComponent(
      priorityRow.createDiv({ cls: 'obsidian-issues-field-input' }),
    );
    this.priorityDropdown.selectEl.id = 'obsidian-issues-priority-input';
    for (const priority of ISSUE_PRIORITIES) {
      this.priorityDropdown.addOption(priority, ISSUE_PRIORITY_LABELS[priority]);
    }
    this.priorityDropdown.setValue(this.options.initial.priority ?? 'medium');

    const projectRow = form.createDiv({ cls: 'obsidian-issues-field' });
    projectRow.createEl(
      'label',
      { text: 'Project', cls: 'obsidian-issues-field-label' },
      (label) => {
        label.htmlFor = 'obsidian-issues-project-input';
      },
    );
    const projectInputEl = projectRow.createDiv({ cls: 'obsidian-issues-field-input' });
    this.projectInput = new TextComponent(projectInputEl);
    this.projectInput.inputEl.id = 'obsidian-issues-project-input';
    this.projectInput.inputEl.setAttribute('list', 'obsidian-issues-project-list');
    this.projectInput.setPlaceholder('Select or type a project');
    const dataList = projectInputEl.createEl('datalist');
    dataList.id = 'obsidian-issues-project-list';
    for (const project of this.options.knownProjects) {
      if (project.length > 0) {
        dataList.createEl('option', { value: project });
      }
    }
    this.projectInput.setValue(this.options.initial.project ?? '');

    const labelsRow = form.createDiv({ cls: 'obsidian-issues-field' });
    labelsRow.createEl(
      'label',
      { text: 'Labels', cls: 'obsidian-issues-field-label' },
    );
    this.tagInput = new TagInput(
      labelsRow.createDiv({ cls: 'obsidian-issues-field-input' }),
      {
        value: this.options.initial.labels ?? [],
        knownLabels: this.options.knownLabels,
        onChange: () => {},
      },
    );

    const dueRow = form.createDiv({ cls: 'obsidian-issues-field' });
    dueRow.createEl(
      'label',
      { text: 'Due date', cls: 'obsidian-issues-field-label' },
      (label) => {
        label.htmlFor = 'obsidian-issues-due-input';
      },
    );
    // A native date picker rather than free text: it can't produce an
    // unparseable value, and it renders in the user's own locale format.
    this.dueInput = dueRow
      .createDiv({ cls: 'obsidian-issues-field-input' })
      .createEl('input', { type: 'date', cls: 'obsidian-issues-due-input' });
    this.dueInput.id = 'obsidian-issues-due-input';
    const initialDue = this.options.initial.due ?? '';
    this.dueInput.value = toIsoDate(initialDue);

    // A date picker cannot hold an unparseable value, so saving would drop it
    // without explanation. Say so up front rather than losing it silently.
    if (initialDue.length > 0 && !isValidDate(initialDue)) {
      dueRow.createEl('p', {
        text: `The stored due date “${initialDue}” could not be read and will be replaced when you save.`,
        cls: 'obsidian-issues-field-warning',
      });
    }

    const clearDue = dueRow.createEl('button', {
      text: 'Clear',
      cls: 'obsidian-issues-due-clear',
      type: 'button',
    });
    clearDue.addEventListener('click', () => {
      this.dueInput.value = '';
    });

    this.buildButtons(form);
  }

  private buildButtons(container: HTMLElement): void {
    const buttons = container.createDiv({
      cls: 'obsidian-issues-modal-buttons',
    });

    const cancelButton = buttons.createEl('button', {
      text: 'Cancel',
      type: 'button',
    });
    cancelButton.addEventListener('click', () => {
      this.close();
    });

    this.submitButton = buttons.createEl('button', {
      text: this.options.submitLabel,
      cls: 'mod-cta obsidian-issues-modal-submit',
      type: 'button',
    });
    this.submitButton.addEventListener('click', () => {
      void this.handleSubmit();
    });
  }

  private async handleSubmit(): Promise<void> {
    // Guards against a second click (or Enter) landing while the first submit
    // is still awaiting, which used to create duplicate issues.
    if (this.submitting) return;

    const title = this.titleInput.getValue().trim();
    if (title.length === 0) {
      new Notice('Title is required');
      this.titleInput.inputEl.focus();
      return;
    }

    const rawDue = this.dueInput.value.trim();
    if (rawDue.length > 0 && !isValidDate(rawDue)) {
      new Notice('Due date is not a valid date');
      this.dueInput.focus();
      return;
    }

    const data: IssueData = {
      title,
      status: this.statusDropdown
        ? (this.statusDropdown.getValue() as IssueStatus)
        : (this.options.initial.status ?? 'open'),
      priority: this.priorityDropdown.getValue() as IssuePriority,
      project: this.projectInput.getValue().trim(),
      source: this.options.initial.source ?? '',
      labels: this.tagInput.getValue(),
      due: toDisplayDate(rawDue),
      created:
        this.options.initial.created ?? new Date().toISOString().slice(0, 10),
    };

    this.setSubmitting(true);
    try {
      await this.options.onSubmit(data);
      this.close();
    } catch (error) {
      console.error('Vault Issues: failed to save issue', error);
      new Notice('Could not save issue. Check the developer console.');
      this.setSubmitting(false);
    }
  }

  private setSubmitting(submitting: boolean): void {
    this.submitting = submitting;
    if (this.submitButton) {
      this.submitButton.disabled = submitting;
      this.submitButton.textContent = submitting ? 'Saving…' : this.options.submitLabel;
    }
  }

  onClose(): void {
    this.tagInput.destroy();
    this.contentEl.empty();
  }
}
