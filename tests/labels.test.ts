import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LABEL_COLOR_COUNT,
  getLabelColorClass,
  getLabelColorIndex,
} from '../src/labels.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (relative: string): string =>
  readFileSync(join(repoRoot, relative), 'utf8');

describe('getLabelColorIndex', () => {
  it('is deterministic for the same name', () => {
    for (const name of ['bug', 'docs', 'a very long label name']) {
      assert.equal(getLabelColorIndex(name), getLabelColorIndex(name));
    }
  });

  it('always lands inside the palette', () => {
    for (const name of ['', 'a', 'ünïcøde', '—', '0'.repeat(500), '🐛 bug']) {
      const index = getLabelColorIndex(name);
      assert.ok(Number.isInteger(index), `${name} produced a non-integer`);
      assert.ok(index >= 0 && index < LABEL_COLOR_COUNT, `${name} → ${index}`);
    }
  });

  it('is case- and whitespace-sensitive, as the hash always was', () => {
    assert.notEqual(getLabelColorIndex('Bug'), getLabelColorIndex('bug'));
  });

  /**
   * Pins the hash so the switch from runtime hex assignment to CSS classes
   * cannot silently recolour anyone's existing labels. These indices were
   * produced by the pre-0.9.0 implementation.
   */
  it('assigns the same slots as the pre-0.9.0 palette lookup', () => {
    const expected: Record<string, number> = {
      bug: 8,
      docs: 5,
      backend: 4,
      security: 0,
      frontend: 4,
      ui: 2,
      urgent: 5,
      chore: 9,
      test: 8,
      refactor: 8,
    };
    for (const [name, index] of Object.entries(expected)) {
      assert.equal(getLabelColorIndex(name), index, `label "${name}"`);
    }
  });
});

describe('getLabelColorClass', () => {
  it('builds the class the stylesheet defines', () => {
    assert.equal(getLabelColorClass('security'), 'vault-issues-label-color-0');
    assert.equal(getLabelColorClass('chore'), 'vault-issues-label-color-9');
  });
});

describe('styles.css', () => {
  it('defines a rule for every palette slot', () => {
    const css = readRepoFile('styles.css');
    for (let i = 0; i < LABEL_COLOR_COUNT; i++) {
      assert.ok(
        css.includes(`.vault-issues-label-color-${i}`),
        `styles.css is missing .vault-issues-label-color-${i}`,
      );
    }
  });

  it('does not leave the JS-positioned suggestion variables behind', () => {
    const css = readRepoFile('styles.css');
    assert.ok(!css.includes('--suggestions-left'));
    assert.ok(!css.includes('--suggestions-top'));
  });
});

/**
 * Obsidian's plugin guidelines forbid assigning styles from JavaScript, and it
 * is a review blocker for the community plugin directory. Guarding it here
 * means a reintroduced `el.style...` fails the build rather than the review.
 */
describe('no runtime style assignment in src/', () => {
  const sources = [
    'src/labels.ts',
    'src/tag-input.ts',
    'src/issue-modal.ts',
    'src/issue-service.ts',
    'src/main.ts',
    'src/settings.ts',
    'src/components/issue-actions.ts',
    'src/components/issue-meta.ts',
    'src/components/issues-toolbar.ts',
    'src/views/issues-view.ts',
    'src/views/issues-list.ts',
    'src/views/issues-kanban.ts',
  ];

  for (const source of sources) {
    it(`${source} assigns no styles`, () => {
      const code = readRepoFile(source);
      assert.ok(!code.includes('.style.'), `${source} touches element.style`);
      assert.ok(!code.includes('setProperty('), `${source} calls setProperty`);
      assert.ok(!code.includes('cssText'), `${source} writes cssText`);
      assert.ok(!/\bstyle\s*=/.test(code), `${source} sets an inline style attribute`);
    });
  }
});
