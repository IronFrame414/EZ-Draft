// EZD-1914 (AC-EZD-1914-2; editor plan 5.2, 5.3 "ProjectEditor.tsx ~500 lines"): ProjectEditor.tsx is under 600 lines.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('EZD-1914 AC-EZD-1914-2 ProjectEditor size', () => {
  it('ProjectEditor.tsx is under 600 lines', () => {
    const text = fs.readFileSync(path.join(__dirname, 'ProjectEditor.tsx'), 'utf8');
    expect(text.split('\n').length - (text.endsWith('\n') ? 1 : 0)).toBeLessThan(600);
  });

  it('names no ceiling tool and wires no click receiver itself', () => {
    const text = fs.readFileSync(path.join(__dirname, 'ProjectEditor.tsx'), 'utf8');
    expect(text).not.toMatch(/Receiver/);
    expect(text).not.toMatch(/ceiling/i);
  });
});
