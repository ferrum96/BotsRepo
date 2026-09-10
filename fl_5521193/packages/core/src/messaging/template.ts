const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export class TemplateRenderError extends Error {
  constructor(readonly missingVariables: string[]) {
    super(`Не заполнены обязательные переменные шаблона: ${missingVariables.join(', ')}`);
    this.name = 'TemplateRenderError';
  }
}

/**
 * Рендер шаблона с явным провалом при пустой обязательной переменной:
 * «Здравствуйте, !» отправлять нельзя (п. 8 ТЗ), поэтому такой контакт
 * уходит менеджеру, а не получает сломанное сообщение.
 */
export function renderTemplate(
  body: string,
  variables: Record<string, string | null | undefined>,
  options: { requiredVariables?: string[]; fallbacks?: Record<string, string> } = {},
): string {
  const { requiredVariables = [], fallbacks = {} } = options;

  const resolve = (name: string): string | null => {
    const value = variables[name];
    if (value !== null && value !== undefined && value !== '') return value;
    return fallbacks[name] ?? null;
  };

  const missing = requiredVariables.filter((name) => resolve(name) === null);
  if (missing.length > 0) throw new TemplateRenderError(missing);

  return body.replace(PLACEHOLDER, (_match, name: string) => resolve(name) ?? '').trim();
}
