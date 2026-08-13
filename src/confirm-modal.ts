import { App, Modal } from 'obsidian';

export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Small yes/no modal. Resolves `true` only when the confirm button is used —
 * dismissing with Escape or the close button resolves `false`.
 */
export class ConfirmModal extends Modal {
  private resolved = false;

  private constructor(
    app: App,
    private readonly options: ConfirmModalOptions,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  static show(app: App, options: ConfirmModalOptions): Promise<boolean> {
    return new Promise((resolve) => {
      new ConfirmModal(app, options, resolve).open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(this.options.title);
    contentEl.createEl('p', {
      text: this.options.message,
      cls: 'obsidian-issues-confirm-message',
    });

    const buttons = contentEl.createDiv({ cls: 'obsidian-issues-modal-buttons' });

    const cancelButton = buttons.createEl('button', {
      text: this.options.cancelLabel ?? 'Cancel',
    });
    cancelButton.addEventListener('click', () => {
      this.finish(false);
    });

    const confirmButton = buttons.createEl('button', {
      text: this.options.confirmLabel ?? 'Confirm',
      cls: this.options.destructive === true ? 'mod-warning' : 'mod-cta',
    });
    confirmButton.addEventListener('click', () => {
      this.finish(true);
    });

    confirmButton.focus();
  }

  private finish(confirmed: boolean): void {
    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(false);
    }
    this.contentEl.empty();
  }
}
