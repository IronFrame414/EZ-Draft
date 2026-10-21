// Header button, secondary or primary (vault/plans/EZD-011a.md Step 5; 04 Frame).
// React 19 takes ref as a prop, so no forwardRef. Every other prop passes through to the <button>.
import type { ButtonHTMLAttributes, Ref } from 'react';
import styles from './HeaderButton.module.css';

export function HeaderButton({
  variant = 'secondary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'secondary' | 'primary';
  ref?: Ref<HTMLButtonElement>;
}) {
  const classes = [
    styles.button,
    variant === 'primary' ? styles.primary : null,
    className ?? null,
  ]
    .filter((c): c is string => c !== null && c.length > 0)
    .join(' ');
  return <button type="button" {...rest} className={classes} />;
}
