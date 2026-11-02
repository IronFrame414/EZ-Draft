-- EZD-290 Step 1 (vault/plans/EZD-290.md; AC-EZD-290-3): the media bucket takes only PNG, JPG and SVG files
-- of at most 5,000,000 bytes, the company logo's types and size (LOGO_CONTENT_TYPES, LOGO_MAX_BYTES in
-- app/src/lib/company/company.ts), so Storage itself refuses any other upload, also one that skips the
-- routes. A later ticket that writes another media prefix widens these limits (docs/architecture.md Storage
-- buckets and paths).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/svg+xml'],
  file_size_limit = 5000000
where id = 'media';
