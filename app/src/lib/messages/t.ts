import type { Language, Message, MessageParams } from './types';

export type T<K extends string> = ((key: K, params?: MessageParams) => string) & {
  has(key: string): key is K;
  readonly language: Language;
};

export class MissingMessageError extends Error {
  constructor(key: string, language: Language) {
    super(`Missing message "${key}" for language "${language}"`);
    this.name = 'MissingMessageError';
  }
}

export class MissingMessageParamError extends Error {
  constructor(param: string, key: string) {
    super(`Missing param "${param}" for message "${key}"`);
    this.name = 'MissingMessageParamError';
  }
}

const pluralRulesCache = new Map<Language, Intl.PluralRules>();

function pluralRules(language: Language): Intl.PluralRules {
  let rules = pluralRulesCache.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    pluralRulesCache.set(language, rules);
  }
  return rules;
}

export function createT<K extends string>(
  language: Language,
  messages: Readonly<Record<K, Message>>,
): T<K> {
  const t = (key: K, params?: MessageParams): string => {
    if (!Object.hasOwn(messages, key)) throw new MissingMessageError(key, language);
    const message = messages[key];
    let text: string;
    if (typeof message === 'string') {
      text = message;
    } else {
      const count = params?.count;
      if (typeof count !== 'number') throw new MissingMessageParamError('count', key);
      text = pluralRules(language).select(count) === 'one' ? message.one : message.other;
    }
    return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
      if (!params || !Object.hasOwn(params, name)) throw new MissingMessageParamError(name, key);
      return String(params[name]);
    });
  };
  const has = (key: string): key is K => Object.hasOwn(messages, key);
  return Object.assign(t, { has, language }) as T<K>;
}
