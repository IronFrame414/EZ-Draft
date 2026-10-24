// Loading placeholder shapes (vault/plans/EZD-015a.md Step 2; S01 Loading). Server-safe, no animation.
import { Fragment, type ReactNode } from 'react';
import styles from './Skeleton.module.css';

export type SkeletonProps = { width?: string; height?: string; radius?: 'sm' | 'md' | 'lg' };

export function Skeleton({ width = '100%', height = '14px', radius = 'md' }: SkeletonProps) {
  return (
    <span
      data-skeleton=""
      aria-hidden="true"
      className={`${styles.skeleton} ${styles[radius]}`}
      style={{ width, height }}
    />
  );
}

export type SkeletonGroupProps = { count: number; children: ReactNode; className?: string };

export function SkeletonGroup({ count, children, className }: SkeletonGroupProps) {
  const n = Math.max(0, Math.trunc(count));
  return (
    <div data-skeleton-group="" aria-busy="true" className={className}>
      {Array.from({ length: n }, (_, i) => (
        <Fragment key={i}>{children}</Fragment>
      ))}
    </div>
  );
}
