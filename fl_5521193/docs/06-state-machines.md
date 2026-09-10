# 6. Стейт-машины

## Статус автоматизации ≠ статус сделки

Это ключевое разделение. Этап сделки в amoCRM — то, что видит менеджер и с чем работает бизнес. Статус автоматизации — то, что решает, уйдёт ли следующее сообщение. Смешать их нельзя: менеджер вправе руками перетащить сделку на любой этап, и это не должно ни включать, ни выключать рассылку неявно.

```
automation_status:

  ACTIVE ──────────┬──► STOPPED_BY_REPLY      (любое входящее, п. 12 ТЗ)
                   ├──► STOPPED_BY_OPT_OUT    (отказ / suppression)
                   ├──► STOPPED_BY_MANAGER    (ручная остановка в админке)
                   ├──► PAUSED                (лимиты, окно, «напишите позже»)
                   ├──► COMPLETED             (серия касаний исчерпана)
                   └──► FAILED                (канал недоступен, исчерпаны retry)

  PAUSED ──► ACTIVE            (возобновление: по дате или вручную)
  STOPPED_BY_* ──► ACTIVE      (только явным действием оператора, с записью в аудит)
```

Из `STOPPED_BY_OPT_OUT` возврат запрещён полностью, если запись в suppression-list имеет уровень `PERMANENT`.

## Шаги сценария касаний

```
NEW
 └─► ELIGIBILITY_CHECK
       ├─ автоканала нет ──► MANUAL_OUTREACH_REQUIRED (конец автоматики, задача менеджеру)
       ├─ suppression ─────► STOPPED_BY_OPT_OUT
       └─ ок
 └─► FIRST_MESSAGE_QUEUED
 └─► FIRST_MESSAGE_SENT            (D0)
 └─► WAITING_FOR_REPLY
 └─► FOLLOWUP_D3_QUEUED  ──► FOLLOWUP_D3_SENT
 └─► FOLLOWUP_D7_QUEUED  ──► FOLLOWUP_D7_SENT     (полезный материал)
 └─► FOLLOWUP_D14_QUEUED ──► FOLLOWUP_D14_SENT    (кейс)
 └─► FOLLOWUP_D30_QUEUED ──► FOLLOWUP_D30_SENT    (мягкое касание)
 └─► LONG_TERM_NURTURE            (п. 11 ТЗ: длительный прогрев)
```

Из любого шага входящее сообщение переводит в `STOPPED_BY_REPLY`. Каждый шаг — отдельная джоба, которая перед отправкой заново читает состояние.

## Этапы сделки: воронка привлечения

```
NEW_PROSPECT          Новый потенциальный партнёр
FIRST_TOUCH_SENT      Первое касание отправлено
NURTURING             Нет ответа / прогрев
REPLIED               Ответил
QUALIFIED             Квалифицирован
INTERESTED            Интерес к партнёрству
CALL_SCHEDULED        Созвон / презентация
THINKING              Думает
PARTNER_CONNECTED     Подключён как партнёр
PARTNER_ACTIVE        Активный партнёр

закрытые:
CLOSED_NOT_TARGET     Не целевой
CLOSED_REFUSED        Отказ
CLOSED_NO_CONTACT     Нет связи
CLOSED_NO_STONES      Не занимается подбором камней
```

## Этапы сделки: воронка активации

```
CONNECTED           Подключён
MATERIALS_REVIEWED  Ознакомился с материалами
FIRST_REFERRAL      Первая рекомендация
FIRST_CLIENT        Первый клиент
FIRST_SALE          Первая продажа
ACTIVE_PARTNER      Активный партнёр
```

Локальные enum'ы, мапинг на числовые ID статусов amoCRM — в конфигурационной таблице. Названия этапов как идентификаторы не используются: их переименуют в первый же месяц работы, и интеграция сломается молча.

## Автопереходы

| Событие | Этап сделки | Статус автоматизации | Побочные действия |
| --- | --- | --- | --- |
| Контакт создан | `NEW_PROSPECT` | `ACTIVE` | Назначить менеджера, запланировать D0 |
| Первое сообщение отправлено | `FIRST_TOUCH_SENT` | без изменений | Запланировать D+3 |
| Нет ответа после D3 | `NURTURING` | без изменений | Запланировать D+7 |
| Входящее сообщение | `REPLIED` | `STOPPED_BY_REPLY` | Задача менеджеру, уведомление |
| Анкета заполнена | `QUALIFIED` | без изменений | Пересчёт score и рейтинга |
| Интерес = высокий | `INTERESTED` | без изменений | Задача на звонок с SLA |
| Отказ | `CLOSED_REFUSED` | `STOPPED_BY_OPT_OUT` | Запись в suppression-list |
| Серия исчерпана | `NURTURING` | `COMPLETED` | Шаг `LONG_TERM_NURTURE` |
| Подключён | `PARTNER_CONNECTED` | `COMPLETED` | Создать партнёра, промокод, воронка активации |
| Первая продажа | `PARTNER_ACTIVE` | — | Пересчёт показателей партнёра |

## Статусы строки импорта

```
NEW → VALIDATED → NORMALIZED → PROCESSING → ┬─► IMPORTED
                                             ├─► DUPLICATE_MERGED     (дополнили карточку)
                                             ├─► DUPLICATE_SKIPPED    (активная сделка уже есть)
                                             ├─► DUPLICATE_IN_FILE
                                             ├─► NEEDS_REVIEW         (нечёткое совпадение)
                                             ├─► MANUAL_OUTREACH      (нет автоканала)
                                             └─► FAILED               (код + текст ошибки)
```

`FAILED` и `NEEDS_REVIEW` — терминальные до вмешательства человека; `retry-failed` переводит `FAILED` обратно в `NORMALIZED`.

## Статусы сообщения

```
QUEUED ──► SENDING ──┬──► SENT ──► DELIVERED ──► READ
                     └──► FAILED ──► (retry с backoff) ──► SENDING
                                └──► DEAD (исчерпаны попытки, событие в лог)

QUEUED ──► RESCHEDULED  (лимит или окно; не ошибка)
QUEUED ──► CANCELLED    (пришёл ответ или сработал suppression)
```

## Guard-цепочка перед отправкой

Проверки выполняются в этом порядке внутри транзакции с `FOR UPDATE` по сделке. Первая непрошедшая проверка определяет исход.

| № | Проверка | Исход при непрохождении |
| --- | --- | --- |
| 1 | `automation_status = ACTIVE` | `CANCELLED` |
| 2 | Нет активной записи в suppression-list | `CANCELLED` + `STOPPED_BY_OPT_OUT` |
| 3 | `last_reply_at` пуст либо раньше начала шага | `CANCELLED` + `STOPPED_BY_REPLY` |
| 4 | Нет сообщения с тем же `idempotency_key` | `CANCELLED` (уже отправлено) |
| 5 | Канал `ACTIVE` и умеет инициировать диалог | `RESCHEDULED` на другой канал |
| 6 | Дневной лимит канала не исчерпан | `RESCHEDULED` на следующее окно |
| 7 | Дневной лимит менеджера не исчерпан | `RESCHEDULED` |
| 8 | Текущее время внутри окна отправки контакта | `RESCHEDULED` на начало окна |
| 9 | Соблюдён джиттер после предыдущей отправки канала | Задержка внутри джобы |
| 10 | Шаблон рендерится, обязательные переменные заполнены | `FAILED` + задача менеджеру |
