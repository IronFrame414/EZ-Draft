-- EZD-215 (03-data-model Q-0704 "The engineer letter needs its own source_file kind, a check-constraint change";
-- AC-EZD-215-4): source_file kind engineer_letter, the optional PDF or image on an engineer note. Same list and order
-- as app/src/lib/storage/source-file-kinds.ts. No new table or policy: the existing source_file policies apply.
alter table public.source_file drop constraint source_file_kind_check;
alter table public.source_file add constraint source_file_kind_check check (kind in (
  'polycam_dxf', 'polycam_glb', 'pdf', 'supplier_pdf', 'dxf', 'image', 'order_report', 'photo', 'panel_photo',
  'field_measure', 'engineer_letter'
));
