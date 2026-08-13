import { setIcon } from 'obsidian';
import { applyLabelColor } from './labels';

export interface TagInputProps {
  value: readonly string[];
  knownLabels: readonly string[];
  onChange: (tags: string[]) => void;
}

export class TagInput {
  private readonly containerEl: HTMLElement;
  private readonly tagsWrapper: HTMLElement;
  private readonly inputEl: HTMLInputElement;
  private readonly suggestionsEl: HTMLElement;
  private readonly knownLabels: readonly string[];
  private readonly onChange: (tags: string[]) => void;

  private tags: string[];
  private suggestions: string[] = [];
  private activeIndex = -1;

  private readonly handleScroll = (): void => {
    if (!this.suggestionsEl.classList.contains('is-hidden')) {
      this.positionSuggestions();
    }
  };

  /**
   * `mousedown` on a suggestion is prevented, so a blur here always means the
   * user moved focus somewhere else entirely — previously the floating list
   * stayed on screen after that.
   */
  private readonly handleBlur = (): void => {
    this.hideSuggestions();
  };

  /**
   * Blur alone isn't enough: clicking a non-focusable part of the modal (a
   * field label, the padding, the dialog background) never moves focus, so no
   * blur fires and the list used to hang around over the form.
   */
  private readonly handleOutsidePointerDown = (e: Event): void => {
    if (this.suggestionsEl.classList.contains('is-hidden')) return;
    const target = e.target;
    if (target instanceof Node && this.containerEl.contains(target)) return;
    this.hideSuggestions();
  };

  constructor(containerEl: HTMLElement, props: TagInputProps) {
    this.containerEl = containerEl;
    this.tags = [...props.value];
    this.knownLabels = props.knownLabels;
    this.onChange = props.onChange;

    containerEl.addClass('obsidian-issues-tag-input');

    this.tagsWrapper = containerEl.createDiv({
      cls: 'obsidian-issues-tag-input-tags',
    });
    this.inputEl = this.tagsWrapper.createEl('input', {
      type: 'text',
      placeholder: 'Type to add labels…',
      cls: 'obsidian-issues-tag-input-field',
    });
    this.inputEl.setAttribute('role', 'combobox');
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.inputEl.setAttribute('aria-autocomplete', 'list');

    this.suggestionsEl = containerEl.createDiv({
      cls: 'obsidian-issues-tag-input-suggestions is-hidden',
    });
    this.suggestionsEl.setAttribute('role', 'listbox');

    this.inputEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.inputEl.addEventListener('input', () => this.handleInput());
    this.inputEl.addEventListener('focus', () => this.handleInput());
    this.inputEl.addEventListener('blur', this.handleBlur);
    this.containerEl.addEventListener('scroll', this.handleScroll);
    document.addEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.addEventListener('resize', this.handleScroll);

    this.renderTags();
  }

  destroy(): void {
    this.inputEl.removeEventListener('blur', this.handleBlur);
    this.containerEl.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.removeEventListener('resize', this.handleScroll);
  }

  getValue(): string[] {
    return [...this.tags];
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Backspace' && this.inputEl.value === '') {
      e.preventDefault();
      this.removeLast();
    } else if (e.key === 'Enter' || e.key === ',') {
      // Enter with a highlighted suggestion accepts it; otherwise the raw text
      // becomes a new label. Either way the event is consumed so it never
      // reaches the modal's submit-on-Enter handler.
      e.preventDefault();
      e.stopPropagation();
      if (this.activeIndex >= 0 && this.suggestions[this.activeIndex] !== undefined) {
        this.selectSuggestion(this.activeIndex);
        return;
      }
      const value = this.inputEl.value.trim();
      if (value) {
        this.add(value);
      }
      this.inputEl.value = '';
      this.hideSuggestions();
    } else if (e.key === 'Escape') {
      if (this.suggestions.length > 0) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.inputEl.value = '';
      this.hideSuggestions();
    } else if (e.key === 'ArrowDown' && this.suggestions.length > 0) {
      e.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.suggestions.length - 1);
      this.renderSuggestions();
    } else if (e.key === 'ArrowUp' && this.suggestions.length > 0) {
      e.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
      this.renderSuggestions();
    }
  }

  private handleInput(): void {
    const query = this.inputEl.value.trim().toLowerCase();

    // Show all known labels when the field is empty / focused, then narrow
    // to matching labels as the user types.
    this.suggestions = this.knownLabels.filter(
      (label): label is string =>
        typeof label === 'string' &&
        label.length > 0 &&
        (query.length === 0 || label.toLowerCase().includes(query)) &&
        !this.tags.includes(label),
    );
    this.activeIndex = -1;
    this.renderSuggestions();
  }

  private renderTags(): void {
    const existingInput = this.inputEl;
    this.tagsWrapper.empty();

    for (const tag of this.tags) {
      const tagEl = this.tagsWrapper.createSpan({ cls: 'obsidian-issues-tag' });
      applyLabelColor(tagEl, tag);
      tagEl.createSpan({ text: tag });

      const removeBtn = tagEl.createEl('button', {
        cls: 'obsidian-issues-tag-remove',
        type: 'button',
        attr: { 'aria-label': `Remove label ${tag}` },
      });
      setIcon(removeBtn, 'x');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(tag);
      });
    }

    this.tagsWrapper.appendChild(existingInput);
    this.positionSuggestions();
  }

  private positionSuggestions(): void {
    const rect = this.inputEl.getBoundingClientRect();
    this.suggestionsEl.style.setProperty('--suggestions-left', `${rect.left}px`);
    this.suggestionsEl.style.setProperty('--suggestions-top', `${rect.bottom + 4}px`);
  }

  private renderSuggestions(): void {
    this.suggestionsEl.empty();

    if (this.suggestions.length === 0) {
      this.suggestionsEl.addClass('is-hidden');
      this.inputEl.setAttribute('aria-expanded', 'false');
      return;
    }

    this.suggestionsEl.removeClass('is-hidden');
    this.inputEl.setAttribute('aria-expanded', 'true');
    this.positionSuggestions();

    for (let i = 0; i < this.suggestions.length; i++) {
      const label = this.suggestions[i]!;
      const item = this.suggestionsEl.createDiv({
        cls: `obsidian-issues-tag-input-suggestion${
          i === this.activeIndex ? ' is-active' : ''
        }`,
        text: label,
        attr: {
          role: 'option',
          'aria-selected': String(i === this.activeIndex),
        },
      });
      applyLabelColor(item, label);
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectSuggestion(i);
      });
    }
  }

  private selectSuggestion(index: number): void {
    const label = this.suggestions[index];
    if (label === undefined || label.length === 0) return;
    this.add(label);
    this.inputEl.value = '';
    this.hideSuggestions();
  }

  private add(tag: string): void {
    const trimmed = tag.trim();
    if (trimmed.length === 0 || this.tags.includes(trimmed)) return;
    this.tags.push(trimmed);
    this.renderTags();
    this.onChange([...this.tags]);
  }

  private remove(tag: string): void {
    this.tags = this.tags.filter((t) => t !== tag);
    this.renderTags();
    this.onChange([...this.tags]);
  }

  private removeLast(): void {
    if (this.tags.length === 0) return;
    this.tags.pop();
    this.renderTags();
    this.onChange([...this.tags]);
  }

  private hideSuggestions(): void {
    this.suggestions = [];
    this.activeIndex = -1;
    this.suggestionsEl.empty();
    this.suggestionsEl.addClass('is-hidden');
    this.inputEl.setAttribute('aria-expanded', 'false');
  }
}
