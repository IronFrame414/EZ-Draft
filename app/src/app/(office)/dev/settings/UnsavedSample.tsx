'use client';
// EZD-103b Step 11 (vault/plans/EZD-103b.md Decided "Dev page", "Page contract"): one sample input wired to the
// unsaved-edits guard and the draft hook; Save stores the value in sessionStorage, or fails when `fail`.
import { useCallback, useState } from 'react';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import {
  useSettingsDraft,
  useUnsavedChanges,
} from '../../../../components/settings/unsaved-changes';

export function UnsavedSample({ fail }: { fail: boolean }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const dirty = value !== saved;
  const save = useCallback(async () => {
    if (fail) return false;
    window.sessionStorage.setItem('ezd-dev-settings-saved', value);
    setSaved(value);
    return true;
  }, [fail, value]);
  useUnsavedChanges(dirty, save);
  useSettingsDraft<string>('dev_sample', dirty ? value : null, setValue);
  return (
    <SettingsMain>
      <input
        data-testid="settings-sample-input"
        aria-label="Sample"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </SettingsMain>
  );
}
