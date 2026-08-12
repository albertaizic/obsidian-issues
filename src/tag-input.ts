import { setIcon } from 'obsidian';
import { getLabelColor, getLabelTextColor } from './labels';

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
      placeholder: 'Type to add labels...',
      cls: 'obsidian-issues-tag-input-field',
    });
    this.suggestionsEl = containerEl.createDiv({
      cls: 'obsidian-issues-tag-input-suggestions is-hidden',
    });

    this.inputEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.inputEl.addEventListener('input', () => this.handleInput());
    this.inputEl.addEventListener('focus', () => this.handleInput());
    this.containerEl.addEventListener('scroll', this.handleScroll);
    window.addEventListener('scroll', this.handleScroll, true);
    window.addEventListener('resize', this.handleScroll);

    this.renderTags();
  }

  destroy(): void {
    this.containerEl.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('scroll', this.handleScroll, true);
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
      e.preventDefault();
      const value = this.inputEl.value.trim();
      if (value) {
        this.add(value);
      }
      this.inputEl.value = '';
      this.hideSuggestions();
    } else if (e.key === 'Escape') {
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
    const query = this.inputEl.value.trim();

    this.suggestions = this.knownLabels
      .filter(
        (label): label is string =>
          typeof label === 'string' &&
          label.length > 0 &&
          label.toLowerCase().includes(query.toLowerCase()) &&
          !this.tags.includes(label),
      );
    this.activeIndex = -1;
    this.renderSuggestions();
  }

  private renderTags(): void {
    const existingInput = this.inputEl;
    this.tagsWrapper.empty();

    for (const tag of this.tags) {
      const color = getLabelColor(tag);
      const tagEl = this.tagsWrapper.createSpan({
        cls: 'obsidian-issues-tag',
      });
      tagEl.style.backgroundColor = color;
      tagEl.style.color = getLabelTextColor(color);

      tagEl.createSpan({ text: tag });

      const removeBtn = tagEl.createEl('button', {
        cls: 'obsidian-issues-tag-remove',
        type: 'button',
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
    this.suggestionsEl.style.left = `${rect.left}px`;
    this.suggestionsEl.style.top = `${rect.bottom + 4}px`;
  }

  private renderSuggestions(): void {
    this.suggestionsEl.empty();

    if (this.suggestions.length === 0) {
      this.suggestionsEl.addClass('is-hidden');
      return;
    }

    this.suggestionsEl.removeClass('is-hidden');
    this.positionSuggestions();

    for (let i = 0; i < this.suggestions.length; i++) {
      const label = this.suggestions[i]!;
      const item = this.suggestionsEl.createDiv({
        cls: `obsidian-issues-tag-input-suggestion${
          i === this.activeIndex ? ' is-active' : ''
        }`,
      });
      const color = getLabelColor(label);
      item.style.backgroundColor = color;
      item.style.color = getLabelTextColor(color);
      item.textContent = label;
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
  }
}
