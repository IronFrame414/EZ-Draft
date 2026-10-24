import type { Language, Surface } from './types';

export function languageFor(
  surface: Exclude<Surface, 'sign_in'>,
  user: { language: Language },
): Language {
  return surface === 'field' || surface === 'dev' ? user.language : 'en';
}

export const NAMESPACES: Record<Surface, readonly string[] | 'all-but-dev'> = {
  office: 'all-but-dev',
  field: ['common', 'field', 'error'],
  client: ['common', 'client', 'error'],
  dev: ['common', 'field', 'error', 'dev'],
  sign_in: ['common', 'error'],
};

export const SPANISH_NAMESPACES = ['common', 'field', 'error', 'dev'] as const;

export const KEY_PATTERN = /^(common|field|client|office|error|dev)\.[a-z0-9_]+(\.[a-z0-9_]+)*$/;
