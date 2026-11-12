'use client';

// EZD-221b Build step 4 (vault/plans/EZD-221b.md Decided "Tiles", "Tile pictures", "Size fields", "Hint or error
// line"; board S01bWizard.dc.html:145-158; S01 Template picker, Validation; Q-0561; Q-0565; Q-0570): the five
// template tiles (Empty first), then for a template its Width, Length and Ceiling height with the live Area,
// and the accepted-forms hint or the refusal after a field is left.
import { parseLength, type LengthFieldKind } from '@ezdraft/geometry';
import type { ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { TEMPLATE_DEFAULTS, TEMPLATE_KEYS, type TemplateKey } from '../../lib/projects/templates';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import {
  blurSize,
  editSize,
  selectTemplate,
  showsRefusal,
  templateAreaText,
  templateSizeText,
  type SizeField,
  type TemplateDraft,
} from './template-draft';
import styles from './TemplatePicker.module.css';

export type TemplatePickerProps = {
  value: TemplateDraft;
  onChange: (d: TemplateDraft) => void;
};

const KIND: LengthFieldKind = 'wall_room';

const PICTURES: Record<TemplateKey, { x: number; y: number; width: number; height: number }> = {
  galley_kitchen: { x: 10, y: 6, width: 100, height: 48 },
  l_kitchen: { x: 18, y: 4, width: 84, height: 52 },
  bath_5x8: { x: 36, y: 4, width: 48, height: 52 },
  primary_bath: { x: 16, y: 4, width: 88, height: 52 },
};

const FIELDS: readonly { field: SizeField; label: MessageKey; testid: string }[] = [
  {
    field: 'width',
    label: 'office.new_project.template_width',
    testid: 'new-project-template-width',
  },
  {
    field: 'length',
    label: 'office.new_project.template_length',
    testid: 'new-project-template-length',
  },
  {
    field: 'ceilingHeight',
    label: 'office.new_project.template_ceiling',
    testid: 'new-project-template-ceiling',
  },
];

const TILES: readonly (TemplateKey | null)[] = [null, ...TEMPLATE_KEYS];

// Board S01bWizard.dc.html:158: the four accepted forms in the hint are set in mono slate-700; the message
// text stays one key and is split around them in order, so the line's text is the message unchanged.
const ACCEPTS_EXAMPLES: readonly string[] = [`12'6"`, `12' 6 1/2"`, `150"`, `12.5'`];

function acceptsParts(text: string): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  let rest = 0;
  for (const example of ACCEPTS_EXAMPLES) {
    const at = text.indexOf(example, rest);
    if (at < 0) continue;
    if (at > rest) parts.push(text.slice(rest, at));
    parts.push(
      <span key={example} className={styles.example}>
        {example}
      </span>,
    );
    rest = at + example.length;
  }
  if (rest < text.length) parts.push(text.slice(rest));
  return parts;
}

export function TemplatePicker({ value, onChange }: TemplatePickerProps): ReactElement {
  const t = useT();
  const area = templateAreaText(value);
  return (
    <>
      <div role="radiogroup" aria-label={t('office.new_project.template')} className={styles.tiles}>
        {TILES.map((key) => {
          const selected = value.key === key;
          const pic = key === null ? null : PICTURES[key];
          return (
            <button
              key={key ?? 'empty'}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid="new-project-template"
              data-template={key ?? 'empty'}
              data-selected={selected ? 'true' : 'false'}
              className={`${styles.tile} ${touch.target}`}
              onClick={() => onChange(selectTemplate(value, key))}
            >
              <span className={styles.pic}>
                {pic !== null ? (
                  <svg width={120} height={60} viewBox="0 0 120 60" aria-hidden="true">
                    <rect className={styles.wall} {...pic} />
                  </svg>
                ) : null}
              </span>
              <span className={styles.name}>
                {t(
                  key === null
                    ? 'office.new_project.template_empty'
                    : `office.new_project.template_${key}`,
                )}
                {selected ? <Icon name="check_circle" size={16} /> : null}
              </span>
              <span className={styles.size}>
                {key === null
                  ? t('office.new_project.template_empty_sub')
                  : t('office.new_project.template_size', {
                      width: templateSizeText(TEMPLATE_DEFAULTS[key].width),
                      length: templateSizeText(TEMPLATE_DEFAULTS[key].length),
                    })}
              </span>
            </button>
          );
        })}
      </div>
      {value.key !== null ? (
        <>
          <div className={styles.sizes}>
            {FIELDS.map(({ field, label, testid }) => (
              <label key={field} className={styles.field}>
                {t(label)}
                <input
                  data-testid={testid}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${styles.input} ${touch.target}`}
                  value={value.text[field]}
                  aria-invalid={
                    value.blurred[field] && !parseLength(value.text[field], KIND).ok
                      ? 'true'
                      : undefined
                  }
                  onChange={(e) => onChange(editSize(value, field, e.target.value))}
                  onBlur={() => onChange(blurSize(value, field))}
                />
              </label>
            ))}
            <div className={styles.field}>
              {t('office.new_project.template_area_label')}
              <span data-testid="new-project-template-area" className={styles.area}>
                {area !== null
                  ? t('office.new_project.template_area', { area })
                  : t('office.new_project.template_area_none')}
              </span>
            </div>
          </div>
          {showsRefusal(value) ? (
            <p role="alert" data-testid="new-project-template-error" className={styles.error}>
              {t('office.length.refused')}
            </p>
          ) : (
            <p data-testid="new-project-template-accepts" className={styles.accepts}>
              {acceptsParts(t('office.new_project.template_accepts'))}
            </p>
          )}
        </>
      ) : null}
    </>
  );
}
