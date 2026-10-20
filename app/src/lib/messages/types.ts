export type Language = 'en' | 'es';

export type Surface = 'office' | 'field' | 'client' | 'dev' | 'sign_in';

export type Message = string | { one: string; other: string };

export type MessageParams = Record<string, string | number>;
