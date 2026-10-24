// Header button, secondary or primary (vault/plans/EZD-011a.md Step 5; 04 Frame).
// React 19 takes ref as a prop, so no forwardRef. Every other prop passes through to the <button>.
// With `icon` (EZD-014b; Q-0055 (a)) the icon shows below 1600 px wide and the name above it.
import type { ButtonHTMLAttributes, Ref } from 'react';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/icon-names.generated';
import styles from './HeaderButton.module.css';

type Base = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'secondary' | 'primary';
  ref?: Ref<HTMLButtonElement>;
};

export type HeaderButtonProps =
  (Base & { icon?: undefined }) | (Omit<Base, 'children'> & { icon: IconName; children: string });

export function HeaderButton(props: HeaderButtonProps) {
  const variant = props.variant ?? 'secondary';
  const classes = (className: string | undefined) =>
    [styles.button, variant === 'primary' ? styles.primary : null, className ?? null]
      .filter((c): c is string => c !== null && c.length > 0)
      .join(' ');
  if (props.icon === undefined) {
    const { variant: _variant, icon: _icon, className, ...rest } = props;
    void _variant;
    void _icon;
    return <button type="button" {...rest} className={classes(className)} />;
  }
  const { variant: _variant, icon, className, children, ...rest } = props;
  void _variant;
  return (
    <button
      type="button"
      aria-label={children}
      title={children}
      {...rest}
      className={classes(className)}
    >
      <span className={styles.icon} data-header-button-icon="">
        <Icon name={icon} size={18} />
      </span>
      <span className={styles.label} data-header-button-label="">
        {children}
      </span>
    </button>
  );
}
