export interface SendWindow {
  /** «10:00» */
  from: string;
  /** «19:00» */
  to: string;
  /** ISO-дни недели: 1 = понедельник, 7 = воскресенье. */
  weekdays: number[];
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number;
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function formatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    isoWeekday: WEEKDAY_TO_ISO[get('weekday')] ?? 1,
  };
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = value.split(':');
  return { hour: Number(hourRaw ?? 0), minute: Number(minuteRaw ?? 0) };
}

/** Смещение зоны в миллисекундах для конкретного момента (учитывает переход на летнее время). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = localParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  // Секунды теряются при форматировании, поэтому сравниваем на минутной сетке.
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** Момент, соответствующий локальному времени в указанной зоне. */
function fromLocal(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = zoneOffsetMs(guess, timeZone);
  const corrected = new Date(guess.getTime() - offset);
  // Повторная поправка нужна на границах перехода времени.
  const secondOffset = zoneOffsetMs(corrected, timeZone);
  return secondOffset === offset ? corrected : new Date(guess.getTime() - secondOffset);
}

export function isInsideSendWindow(date: Date, window: SendWindow, timeZone: string): boolean {
  const parts = localParts(date, timeZone);
  if (!window.weekdays.includes(parts.isoWeekday)) return false;

  const from = parseTime(window.from);
  const to = parseTime(window.to);
  const minutes = parts.hour * 60 + parts.minute;

  return minutes >= from.hour * 60 + from.minute && minutes < to.hour * 60 + to.minute;
}

/**
 * Ближайшее начало окна отправки: сообщение вне окна переносится,
 * а не падает с ошибкой (docs/02-critical.md R7).
 */
export function nextSendWindowStart(date: Date, window: SendWindow, timeZone: string): Date {
  if (isInsideSendWindow(date, window, timeZone)) return date;

  const from = parseTime(window.from);
  const parts = localParts(date, timeZone);
  const minutesNow = parts.hour * 60 + parts.minute;

  for (let offset = 0; offset <= 8; offset += 1) {
    const candidateDay = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + offset, 12, 0),
    );
    const candidateParts = localParts(candidateDay, timeZone);

    if (!window.weekdays.includes(candidateParts.isoWeekday)) continue;
    if (offset === 0 && minutesNow >= from.hour * 60 + from.minute) continue;

    return fromLocal(
      timeZone,
      candidateParts.year,
      candidateParts.month,
      candidateParts.day,
      from.hour,
      from.minute,
    );
  }

  // Окно задано так, что подходящих дней нет — не молчим, ошибка конфигурации.
  throw new Error(`send window has no valid weekday: ${JSON.stringify(window)}`);
}

/** Разброс между отправками одного канала: ровный интервал сам по себе выглядит как бот. */
export function jitterSeconds(min: number, max: number, random = Math.random): number {
  if (max <= min) return min;
  return Math.floor(min + random() * (max - min));
}
