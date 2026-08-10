import {
  App,
  DropdownComponent,
  Modal,
  Notice,
  TextComponent,
} from 'obsidian';
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_LABELS, ISSUE_STATUSES } from './constants';
import type { IssueData, IssuePriority, IssueStatus } from './types';

export interface IssueModalOptions {
  title: string;
  initial: Partial<IssueData>;
  statusEditable: boolean;
  submitLabel: string;
  onSubmit: (data: IssueData) => void | Promise<void>;
}

export class IssueModal extends Modal {
  private titleInput!: TextComponent;
  private statusDropdown: DropdownComponent | null = null;
  private priorityDropdown!: DropdownComponent;
  private projectInput!: TextComponent;
  private labelsInput!: TextComponent;
  private dueInput!: TextComponent;

  constructor(app: App, private options: IssueModalOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(this.options.title);

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

    if (this.options.statusEditable) {
      const statusRow = form.createDiv({ cls: 'obsidian-issues-field' });
      statusRow.createEl(
        'label',
        { text: 'Status', cls: 'obsidian-issues-field-label' },
      );
      this.statusDropdown = new DropdownComponent(
        statusRow.createDiv({ cls: 'obsidian-issues-field-input' }),
      );
      for (const status of ISSUE_STATUSES) {
        this.statusDropdown.addOption(
          status.charAt(0).toUpperCase() + status.slice(1),
          status,
        );
      }
      this.statusDropdown.setValue(
        this.options.initial.status ?? 'open',
      );
    }

    const priorityRow = form.createDiv({ cls: 'obsidian-issues-field' });
    priorityRow.createEl(
      'label',
      { text: 'Priority', cls: 'obsidian-issues-field-label' },
    );
    this.priorityDropdown = new DropdownComponent(
      priorityRow.createDiv({ cls: 'obsidian-issues-field-input' }),
    );
    for (const priority of ISSUE_PRIORITIES) {
      this.priorityDropdown.addOption(
        ISSUE_PRIORITY_LABELS[priority],
        priority,
      );
    }
    this.priorityDropdown.setValue(
      this.options.initial.priority ?? 'medium',
    );

    const projectRow = form.createDiv({ cls: 'obsidian-issues-field' });
    projectRow.createEl(
      'label',
      { text: 'Project', cls: 'obsidian-issues-field-label' },
    );
    this.projectInput = new TextComponent(
      projectRow.createDiv({ cls: 'obsidian-issues-field-input' }),
    );
    this.projectInput
      .setPlaceholder('Enter project name')
      .setValue(this.options.initial.project ?? '');

    const labelsRow = form.createDiv({ cls: 'obsidian-issues-field' });
    labelsRow.createEl(
      'label',
      { text: 'Labels', cls: 'obsidian-issues-field-label' },
    );
    this.labelsInput = new TextComponent(
      labelsRow.createDiv({ cls: 'obsidian-issues-field-input' }),
    );
    this.labelsInput
      .setPlaceholder('Comma-separated (e.g. GitHub, portfolio)')
      .setValue(
        this.options.initial.labels?.join(', ') ?? '',
      );

    const dueRow = form.createDiv({ cls: 'obsidian-issues-field' });
    dueRow.createEl(
      'label',
      { text: 'Due date', cls: 'obsidian-issues-field-label' },
    );
    this.dueInput = new TextComponent(
      dueRow.createDiv({ cls: 'obsidian-issues-field-input' }),
    );
    this.dueInput.inputEl.type = 'date';
    this.dueInput.setValue(this.options.initial.due ?? '');

    this.buildButtons(form);
  }

  private buildButtons(container: HTMLElement): void {
    const buttons = container.createDiv({
      cls: 'obsidian-issues-modal-buttons',
    });

    const submitButton = buttons.createEl('button', {
      text: this.options.submitLabel,
      cls: 'mod-cta obsidian-issues-modal-submit',
    });

    submitButton.addEventListener('click', () => {
      void this.handleSubmit();
    });

    const cancelButton = buttons.createEl('button', {
      text: 'Cancel',
      cls: 'mod-secondary',
    });

    cancelButton.addEventListener('click', () => {
      this.close();
    });
  }

  private async handleSubmit(): Promise<void> {
    const title = this.titleInput.getValue().trim();
    if (title.length === 0) {
      new Notice('Title is required');
      return;
    }

    const data: IssueData = {
      title,
      status: this.statusDropdown
        ? (this.statusDropdown.getValue() as IssueStatus)
        : (this.options.initial.status ?? 'open'),
      priority: this.priorityDropdown.getValue() as IssuePriority,
      project: this.projectInput.getValue().trim(),
      labels: this.labelsInput
        .getValue()
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      due: this.dueInput.getValue(),
      created:
        this.options.initial.created ?? new Date().toISOString().slice(0, 10),
    };

    await this.options.onSubmit(data);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
