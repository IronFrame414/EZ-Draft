// Button for banners, toasts and dialogs (vault/plans/EZD-015a.md Step 6; S01 .b, .bp; S20 .bd).
// React 19 takes ref as a prop. Every other prop passes through to the <button>.
import type { ButtonHTMLAttributes, Ref } from 'react';
import touch from '../../styles/touch.module.css';
import styles from './StateButton.module.css';

export type StateButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'secondary' | 'primary' | 'danger' | 'icon';
  compact?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function StateButton(props: StateButtonProps) {
  const { variant = 'secondary', compact, className, ...rest } = props;
  const classes = [
    styles.button,
    styles[variant],
    compact ? styles.compact : '',
    touch.target,
    className ?? '',
  ]
    .filter((c) => c.length > 0)
    .join(' ');
  return <button type="button" {...rest} className={classes} />;
}
