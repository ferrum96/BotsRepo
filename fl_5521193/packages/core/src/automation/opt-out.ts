/**
 * Явный отказ от переписки. Отделён от обычного «не интересно» намеренно:
 * любой ответ и так останавливает автоматизацию (п. 12 ТЗ), а вот постоянный
 * запрет на канал — необратимое действие, и включать его по мягкой формулировке
 * нельзя. Список расширяется по договорённости с заказчиком (вопрос 9).
 */
const EXPLICIT_OPT_OUT = [
  /не\s*пиш/i,
  /не\s*надо\s*писать/i,
  /отпиш/i,
  /отстань/i,
  /удалите\s*мои\s*данные/i,
  /удалите\s*меня/i,
  /\bстоп\b/i,
  /\bstop\b/i,
  /unsubscribe/i,
  /спам/i,
];

export function detectExplicitOptOut(body: string): boolean {
  return EXPLICIT_OPT_OUT.some((pattern) => pattern.test(body));
}

/** «Позже», «напишите через месяц» — пауза, а не постоянный запрет. */
const POSTPONE = [/позже/i, /через\s*(месяц|неделю|пару\s*недель)/i, /не\s*сейчас/i];

export function detectPostpone(body: string): boolean {
  return POSTPONE.some((pattern) => pattern.test(body));
}
