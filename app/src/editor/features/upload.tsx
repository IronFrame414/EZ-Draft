// EZD-1913c (editor plan 5.3 "features plug in"; 2.6 "upload files"): the Upload files dialog as a registry feature,
// moved unchanged out of ProjectEditor.
// - EZD-301 (S02 Entry): for an editor who may edit now, the header's Upload files button (after the review pill)
//   opens the Upload files dialog, loaded with the edit menus' lazy module (shared/edit-menu-module.ts). The dialog
//   draws last in the header place, after the conflict banner.
// - EZD-304 (S01 PDF: scale calibration): an upload from the header makes the PDF underlay read the project's files
//   again (the page's filesChanged, which ProjectEditor's underlay listens to).
import { useState } from 'react';
import { StateButton } from '../../components/states/StateButton';
import { useT } from '../../lib/messages';
import { editMenuModule } from '../shared/edit-menu-module';
import { lazyPart } from '../shared/lazy-part';
import type { EditorFeature, EditorFeatureContext } from './types';

const LazyUploadFiles = lazyPart(editMenuModule, 'UploadFilesDialog');

export type UploadOwn = {
  readonly uploading: boolean;
  readonly setUploading: (on: boolean) => void;
};

const ownOf = (ctx: EditorFeatureContext): UploadOwn | undefined =>
  ctx.own?.get('upload') as UploadOwn | undefined;

function useUploadOwn(): UploadOwn {
  const [uploading, setUploading] = useState(false);
  return { uploading, setUploading };
}

function UploadButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <StateButton data-testid="editor-upload-files" compact onClick={onClick}>
      {t('office.upload.editor_button')}
    </StateButton>
  );
}

export const feature: EditorFeature = {
  id: 'upload',
  order: 900,
  // On an open editor; an open dialog stays open while the editor reopens.
  active: (ctx) => ctx.ready !== undefined || ownOf(ctx)?.uploading === true,
  useOwn: useUploadOwn,
  headerEnd: (ctx) => {
    const own = ownOf(ctx);
    return ctx.mayEdit && own !== undefined ? (
      <UploadButton onClick={() => own.setUploading(true)} />
    ) : null;
  },
  header: (ctx) => {
    const own = ownOf(ctx);
    if (own?.uploading !== true) return null;
    return (
      <LazyUploadFiles
        projectId={ctx.projectId}
        onClose={() => {
          own.setUploading(false);
          ctx.page?.filesChanged.notify();
        }}
      />
    );
  },
};
