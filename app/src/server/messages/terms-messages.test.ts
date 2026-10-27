// EZD-1707 T1 (vault/plans/EZD-1707.md sections 3, 4, 6): the five terms keys hold the wording of section 6
// (W1-W5) exactly, in en and es. Sources: section 6 (Josh approves at Stage 2, PROCESS.md 3a); Q-0230; Q-0015.
import { describe, expect, it } from 'vitest';
import { en } from './catalogs/en';
import { es } from './catalogs/es';

const dict = {
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
};

const WORDING = {
  en: {
    'common.terms.title': 'Terms of service',
    'common.terms.no_certification':
      'EZ Draft does not certify that any drawing, calculation or plan complies with building, electrical or other codes.',
    'common.terms.responsibility':
      "EZ Draft is for design and planning only. Responsibility for code compliance stays with the licensed user: all calculations and codes must be verified by the user and a licensed professional in the project's jurisdiction.",
    'common.terms.placeholder':
      'Placeholder: the full terms of service are not written yet and will replace this text. The two statements above apply now.',
    'common.terms.back': 'Back to sign in',
  },
  es: {
    'common.terms.title': 'Términos del servicio',
    'common.terms.no_certification':
      'EZ Draft no certifica que ningún plano, cálculo o diseño cumpla con los códigos de construcción, eléctricos ni otros.',
    'common.terms.responsibility':
      'EZ Draft es solo para diseño y planificación. La responsabilidad del cumplimiento de los códigos es del usuario con licencia: todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto.',
    'common.terms.placeholder':
      'Texto provisional: los términos completos del servicio aún no están redactados y reemplazarán este texto. Las dos declaraciones anteriores ya se aplican.',
    'common.terms.back': 'Volver a iniciar sesión',
  },
} as const;

describe('EZD-1707 terms messages', () => {
  it('EZD-1707 T1 terms keys equal the section 6 wording in en and es', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const [key, value] of Object.entries(WORDING[lang])) {
        expect(dict[lang][key], `${lang} ${key}`).toBe(value);
      }
    }
  });
});
