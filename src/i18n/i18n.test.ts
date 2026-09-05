import { describe, it, expect } from 'vitest';
import { es } from './locales/es.ts';
import { en } from './locales/en.ts';

function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...getAllKeys(v as Record<string, unknown>, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

describe('Internationalization (i18n) Integrity Suite', () => {
  const esKeys = getAllKeys(es).sort();
  const enKeys = getAllKeys(en).sort();

  it('guarantees 100% key parity between Spanish and English dictionaries', () => {
    // Every key in Spanish must exist in English
    const missingInEnglish = esKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEnglish, `Missing keys in English: ${missingInEnglish.join(', ')}`).toEqual([]);

    // Every key in English must exist in Spanish
    const missingInSpanish = enKeys.filter((k) => !esKeys.includes(k));
    expect(missingInSpanish, `Missing keys in Spanish: ${missingInSpanish.join(', ')}`).toEqual([]);

    expect(esKeys.length).toBe(enKeys.length);
    expect(esKeys.length).toBeGreaterThan(50);
  });

  it('verifies that no translation strings are empty or whitespace-only', () => {
    for (const key of esKeys) {
      const valEs = getValueByPath(es, key);
      expect(typeof valEs, `Spanish key ${key} should be a string`).toBe('string');
      expect((valEs as string).trim().length, `Spanish key ${key} must not be empty`).toBeGreaterThan(0);

      const valEn = getValueByPath(en, key);
      expect(typeof valEn, `English key ${key} should be a string`).toBe('string');
      expect((valEn as string).trim().length, `English key ${key} must not be empty`).toBeGreaterThan(0);
    }
  });

  it('verifies matching interpolation placeholders between languages', () => {
    const paramRegex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

    for (const key of esKeys) {
      const valEs = getValueByPath(es, key) as string;
      const valEn = getValueByPath(en, key) as string;

      const paramsEs = Array.from(valEs.matchAll(paramRegex), (m) => m[1]).sort();
      const paramsEn = Array.from(valEn.matchAll(paramRegex), (m) => m[1]).sort();

      expect(
        paramsEn,
        `Interpolation placeholders mismatch in key ${key}: ES=[${paramsEs}], EN=[${paramsEn}]`
      ).toEqual(paramsEs);
    }
  });
});
