import type { TranslationSchema } from './locales/es.ts';

export type SupportedLanguage = 'es' | 'en';

export type { TranslationSchema };

// Dot-notation path builder for nested dictionary
type PrevDepth = [never, 0, 1, 2, 3, 4];

export type DotNestedKeys<T, Depth extends number = 3> = [Depth] extends [never]
  ? never
  : T extends object
  ? {
      [K in keyof T & (string | number)]: T[K] extends object
        ? `${K}` | `${K}.${DotNestedKeys<T[K], PrevDepth[Depth]>}`
        : `${K}`;
    }[keyof T & (string | number)]
  : never;

export type TranslationPath = DotNestedKeys<TranslationSchema>;
