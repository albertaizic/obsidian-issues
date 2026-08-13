import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareDueDates,
  dueState,
  dueVariant,
  isValidDate,
  toDisplayDate,
  toIsoDate,
  todayIso,
} from '../src/dates.ts';

describe('toIsoDate', () => {
  it('accepts the display format', () => {
    assert.equal(toIsoDate('20/08/2026'), '2026-08-20');
  });

  it('accepts ISO input unchanged', () => {
    assert.equal(toIsoDate('2026-08-20'), '2026-08-20');
  });

  it('pads single-digit components', () => {
    assert.equal(toIsoDate('5/8/2026'), '2026-08-05');
  });

  it('returns empty for blank input', () => {
    assert.equal(toIsoDate(''), '');
    assert.equal(toIsoDate('   '), '');
  });

  it('rejects dates that do not exist', () => {
    assert.equal(toIsoDate('31/02/2026'), '');
    assert.equal(toIsoDate('2026-13-01'), '');
    assert.equal(toIsoDate('2025-02-29'), '');
  });

  it('accepts a real leap day', () => {
    assert.equal(toIsoDate('29/02/2024'), '2024-02-29');
  });

  it('rejects free text', () => {
    assert.equal(toIsoDate('next tuesday'), '');
    assert.equal(toIsoDate('20-08-2026'), '');
  });
});

describe('toDisplayDate', () => {
  it('round-trips through the display format', () => {
    assert.equal(toDisplayDate('2026-08-20'), '20/08/2026');
    assert.equal(toDisplayDate('20/08/2026'), '20/08/2026');
  });

  it('drops unparseable values rather than emitting "Invalid date"', () => {
    assert.equal(toDisplayDate('tomorrow'), '');
  });
});

describe('isValidDate', () => {
  it('distinguishes real dates from junk', () => {
    assert.equal(isValidDate('01/01/2026'), true);
    assert.equal(isValidDate('99/99/9999'), false);
  });
});

describe('dueState', () => {
  const today = '2026-08-13';

  it('reports missing and malformed values separately', () => {
    assert.equal(dueState('', today), 'none');
    assert.equal(dueState('soon', today), 'invalid');
  });

  it('classifies relative to today', () => {
    assert.equal(dueState('13/08/2026', today), 'today');
    assert.equal(dueState('12/08/2026', today), 'overdue');
    assert.equal(dueState('14/08/2026', today), 'future');
  });
});

describe('dueVariant', () => {
  const today = '2026-08-13';

  it('flags urgency while the issue is open', () => {
    assert.equal(dueVariant('13/08/2026', false, today), 'today');
    assert.equal(dueVariant('12/08/2026', false, today), 'overdue');
    assert.equal(dueVariant('14/08/2026', false, today), 'future');
  });

  it('suppresses urgency once the issue is closed', () => {
    assert.equal(dueVariant('13/08/2026', true, today), 'done');
    assert.equal(dueVariant('12/08/2026', true, today), 'done');
    assert.equal(dueVariant('14/08/2026', true, today), 'done');
  });

  it('still reports missing and malformed dates on closed issues', () => {
    assert.equal(dueVariant('', true, today), 'none');
    assert.equal(dueVariant('whenever', true, today), 'invalid');
  });
});

describe('compareDueDates', () => {
  it('orders real dates chronologically', () => {
    assert.equal(compareDueDates('01/01/2026', '02/01/2026'), -1);
    assert.equal(compareDueDates('02/01/2026', '01/01/2026'), 1);
    assert.equal(compareDueDates('01/01/2026', '2026-01-01'), 0);
  });

  it('sorts undated and unparseable values last', () => {
    assert.equal(compareDueDates('', '01/01/2026'), 1);
    assert.equal(compareDueDates('01/01/2026', ''), -1);
    assert.equal(compareDueDates('junk', '01/01/2026'), 1);
  });
});

describe('todayIso', () => {
  it('formats a local date without timezone shifting', () => {
    // 1 January at 00:30 local time must not roll back to 31 December.
    assert.equal(todayIso(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
    assert.equal(todayIso(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
  });
});
