import { describe, expect, it } from 'vitest';
import { initialLanguage, translate } from './i18n';
import { assessMrz } from './lib/mrz';
import { createSyntheticMrz } from '../tests/fixtures';

describe('language selection and validator integration', () => {
  it('uses Romanian browser variants and English for unsupported preferences', () => {
    expect(initialLanguage(['ro-RO', 'en-GB'])).toBe('ro');
    expect(initialLanguage(['RO-md'])).toBe('ro');
    expect(initialLanguage(['en-GB'])).toBe('en');
    expect(initialLanguage(['fr-FR'])).toBe('en');
    expect(initialLanguage([])).toBe('en');
  });

  for (const format of ['TD1', 'TD2'] as const) {
    it(`translates ${format} parser labels and check-digit failure messages`, () => {
      const fixture = createSyntheticMrz(format);
      const row = format === 'TD1' ? 0 : 1;
      const index = format === 'TD1' ? 14 : 9;
      fixture.lines[row] = fixture.lines[row].slice(0, index) + String((Number(fixture.lines[row][index]) + 1) % 10) + fixture.lines[row].slice(index + 1);
      const assessment = assessMrz(fixture.lines);
      expect(assessment.mrzValid).toBe(false);
      for (const check of assessment.checks) {
        expect(translate(check.label, 'ro'), check.label).not.toBe(check.label);
        if (check.detail) expect(translate(check.detail, 'ro'), check.detail).not.toBe(check.detail);
      }
      for (const message of [...assessment.issues, ...assessment.warnings]) {
        expect(translate(message, 'en')).toBe(message);
        expect(translate(message, 'ro'), message).not.toBe(message);
      }
    });
  }
});
