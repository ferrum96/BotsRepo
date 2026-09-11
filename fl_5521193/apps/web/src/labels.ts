export const STAGE: Record<string, string> = {
  NEW_PROSPECT: 'Новый партнёр',
  FIRST_TOUCH_SENT: 'Первое касание',
  NURTURING: 'Прогрев',
  REPLIED: 'Ответил',
  QUALIFIED: 'Квалифицирован',
  INTERESTED: 'Интерес',
  CALL_SCHEDULED: 'Созвон',
  THINKING: 'Думает',
  PARTNER_CONNECTED: 'Подключён',
  PARTNER_ACTIVE: 'Активный',
  CLOSED_NOT_TARGET: 'Не целевой',
  CLOSED_REFUSED: 'Отказ',
  CLOSED_NO_CONTACT: 'Нет связи',
  CLOSED_NO_STONES: 'Не камни',
};

export const AUTOMATION: Record<string, string> = {
  ACTIVE: 'Идёт',
  PAUSED: 'Пауза',
  STOPPED_BY_REPLY: 'Стоп: ответ',
  STOPPED_BY_MANAGER: 'Стоп: менеджер',
  STOPPED_BY_OPT_OUT: 'Стоп: отказ',
  COMPLETED: 'Серия закрыта',
  FAILED: 'Ошибка',
};

export const ROW_STATUS: Record<string, string> = {
  IMPORTED: 'Импортирован',
  DUPLICATE_MERGED: 'Дубль: дополнили',
  DUPLICATE_SKIPPED: 'Дубль: сделка есть',
  DUPLICATE_IN_FILE: 'Дубль в файле',
  MANUAL_OUTREACH: 'Ручная очередь',
  FAILED: 'Ошибка',
  NEEDS_REVIEW: 'На проверку',
  PROCESSING: 'В работе',
  NORMALIZED: 'Нормализован',
};

export const ELIGIBILITY: Record<string, string> = {
  AUTO_OK: 'Автоканал',
  MANUAL_ONLY: 'Только руками',
  BLOCKED: 'Блок',
  UNKNOWN: 'Неясно',
};
