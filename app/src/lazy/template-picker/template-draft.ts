// EZD-221b Build step 3 (vault/plans/EZD-221b.md Decided "initialTemplateDraft", "templateSizeText",
// "selectTemplate", "editSize / blurSize", "readTemplate", "showsRefusal", "templateAreaText"; Q-0561; Q-0565;
// Q-0570): the New project step 2 template choice and its typed sizes. Pure functions; the input is never
// mutated. Only this lazy folder imports @ezdraft/geometry (Decided "Why lazy").
import { PLAN_DISPLAY_DENOMINATOR, formatLength, parseLength } from '@ezdraft/geometry';
import {
  DEFAULT_CEILING_HEIGHT_IN,
  TEMPLATE_DEFAULTS,
  templateAreaSqFt,
  type TemplateBody,
  type TemplateKey,
} from '../../lib/projects/templates';

export type SizeField = 'width' | 'length' | 'ceilingHeight';

export const SIZE_FIELDS: readonly SizeField[] = ['width', 'length', 'ceilingHeight'];

export type TemplateDraft = {
  key: TemplateKey | null;
  text: Record<SizeField, string>;
  blurred: Record<SizeField, boolean>;
};

export type TemplateRead =
  { ok: true; template: TemplateBody | null } | { ok: false; refused: SizeField[] };

export function templateSizeText(inches: number): string {
  return formatLength(inches, PLAN_DISPLAY_DENOMINATOR);
}

export function initialTemplateDraft(): TemplateDraft {
  return {
    key: null,
    text: { width: '', length: '', ceilingHeight: templateSizeText(DEFAULT_CEILING_HEIGHT_IN) },
    blurred: { width: false, length: false, ceilingHeight: false },
  };
}

export function selectTemplate(d: TemplateDraft, key: TemplateKey | null): TemplateDraft {
  if (key === null) return { ...d, key: null };
  const size = TEMPLATE_DEFAULTS[key];
  return {
    key,
    text: {
      ...d.text,
      width: templateSizeText(size.width),
      length: templateSizeText(size.length),
    },
    blurred: { ...d.blurred, width: false, length: false },
  };
}

export function editSize(d: TemplateDraft, field: SizeField, text: string): TemplateDraft {
  return {
    ...d,
    text: { ...d.text, [field]: text },
    blurred: { ...d.blurred, [field]: false },
  };
}

export function blurSize(d: TemplateDraft, field: SizeField): TemplateDraft {
  return { ...d, blurred: { ...d.blurred, [field]: true } };
}

export function readTemplate(d: TemplateDraft): TemplateRead {
  if (d.key === null) return { ok: true, template: null };
  const width = parseLength(d.text.width, 'wall_room');
  const length = parseLength(d.text.length, 'wall_room');
  const ceilingHeight = parseLength(d.text.ceilingHeight, 'wall_room');
  if (!width.ok || !length.ok || !ceilingHeight.ok) {
    const parsed: Record<SizeField, boolean> = {
      width: width.ok,
      length: length.ok,
      ceilingHeight: ceilingHeight.ok,
    };
    return { ok: false, refused: SIZE_FIELDS.filter((f) => !parsed[f]) };
  }
  return {
    ok: true,
    template: {
      key: d.key,
      width: width.inches,
      length: length.inches,
      ceilingHeight: ceilingHeight.inches,
    },
  };
}

export function showsRefusal(d: TemplateDraft): boolean {
  if (d.key === null) return false;
  return SIZE_FIELDS.some((f) => d.blurred[f] && !parseLength(d.text[f], 'wall_room').ok);
}

export function templateAreaText(d: TemplateDraft): string | null {
  if (d.key === null) return null;
  const w = parseLength(d.text.width, 'wall_room');
  const l = parseLength(d.text.length, 'wall_room');
  if (!w.ok || !l.ok) return null;
  return String(templateAreaSqFt(w.inches, l.inches)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
