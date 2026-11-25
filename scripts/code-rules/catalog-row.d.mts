// EZD-611a: types of catalog-row.mjs for the app's TypeScript.
export declare const CATALOG_PATH: string;
export declare const SECTION_COLUMN_BY_EDITION: Readonly<Record<'fbc8_nec2020' | 'fbc9_nec2023', string>>;
export declare const CATALOG_COLUMNS: readonly string[];
export declare function catalogRow(entry: Record<string, string>): Record<string, string | null>;
