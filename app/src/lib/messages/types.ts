export type Language = 'en' | 'es';

export type Surface = 'office' | 'field' | 'client' | 'dev';

export type Message = string | { one: string; other: string };

export type MessageParams = Record<string, string | number>;
