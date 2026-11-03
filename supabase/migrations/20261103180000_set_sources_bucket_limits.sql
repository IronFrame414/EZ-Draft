-- EZD-296 Step 1 (vault/plans/EZD-296.md; Q-0477, Q-0513 (a), Q-0514 (a)): the sources bucket takes only DXF,
-- GLB, PDF, JPEG, PNG and HEIC files of at most 52,428,800 bytes (50 MiB), the values of SOURCE_CONTENT_TYPES and
-- SOURCE_MAX_BYTES in app/src/lib/storage/source-file-kinds.ts, so Storage itself refuses any other upload,
-- also one that skips the routes. Existing rows and objects are untouched.
update storage.buckets
set allowed_mime_types = array[
    'image/vnd.dxf', 'model/gltf-binary', 'application/pdf', 'image/jpeg', 'image/png', 'image/heic'
  ],
  file_size_limit = 52428800
where id = 'sources';
