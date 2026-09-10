# 5. Модель данных

Основа взята из плана разработки; ниже — что добавлено, что изменено и какие гарантии обеспечиваются самой БД, а не кодом.

## Отличия от плана

1. **Добавлены `data_provenance`, `duplicate_reviews`, `suppression_list`, `scoring_configs`, `partners`, `referrals`, `orders`, `channels`, `manual_outreach_tasks`.** Первые три закрывают комплаенс и безопасность дедупа, остальные — пробелы ТЗ по scoring-конфигу и атрибуции продаж.
2. **`opt_outs` заменён на `suppression_list`** с двумя уровнями: пауза до даты и постоянный запрет. По ТЗ (п. 12) «напишите через месяц» и «не интересно» — разные исходы, одной таблицей флагов они не выражаются.
3. **`manager_limits` разделены на менеджера и канал.** Один менеджер может работать с нескольких номеров, один номер — обслуживать нескольких менеджеров. Бан приходит на номер, а не на менеджера, поэтому лимит нужен именно на канал.
4. **У `messages` появились `rendered_body` и `template_version_id`.** Хранить нужно фактически отправленный текст: шаблоны меняются, а разбираться с получателем придётся по конкретной формулировке.
5. **`contacts` дополнены `automation_eligibility` и `preferred_channel`** — чтобы контакты без доступного канала явно попадали в ручную очередь, а не терялись.

## Ключевые таблицы

### Идентичность и дедупликация

```sql
create table contacts (
  id                    uuid primary key default gen_random_uuid(),
  amocrm_contact_id     bigint unique,
  first_name            text,
  last_name             text,
  phone_raw             text,
  email_raw             text,
  telegram_username_raw text,
  telegram_user_id      bigint,
  whatsapp_raw          text,
  profile_url           text,
  telegram_url          text,
  vk_url                text,
  instagram_url         text,
  website               text,
  school_name           text,
  city                  text,
  country               text,
  timezone              text,
  specialization        text,
  contact_type          text not null default 'POTENTIAL_ASTRO_PARTNER',
  acquisition_source    text not null,
  qualification_status  text not null default 'NOT_QUALIFIED',
  automation_eligibility text not null default 'UNKNOWN',
    -- UNKNOWN | AUTO_OK | MANUAL_ONLY | BLOCKED
  preferred_channel     text,
  legal_basis           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table contact_identifiers (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references contacts(id) on delete cascade,
  type             text not null,   -- PHONE | TELEGRAM_ID | TELEGRAM_USERNAME | EMAIL | URL
  raw_value        text not null,   -- исходное значение для аудита
  normalized_value text not null,
  is_primary       boolean not null default false,
  created_at       timestamptz not null default now()
);

-- главная гарантия от дублей: не проверка в коде, а ограничение БД
create unique index contact_identifiers_unique
  on contact_identifiers (type, normalized_value);

create index contact_identifiers_contact on contact_identifiers (contact_id);

-- откуда взялись персональные данные; обязательно для 152-ФЗ
create table data_provenance (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references contacts(id) on delete cascade,
  source         text not null,     -- PARSING_TELEGRAM | VK | SITE | INSTAGRAM | REFERRAL | ...
  source_url     text,
  collected_at   timestamptz,
  import_row_id  uuid,
  created_at     timestamptz not null default now()
);

-- нечёткие совпадения не мержим автоматически
create table duplicate_reviews (
  id             uuid primary key default gen_random_uuid(),
  import_row_id  uuid not null,
  candidate_contact_id uuid not null references contacts(id),
  match_reason   jsonb not null,
  confidence     numeric(3,2) not null,
  status         text not null default 'PENDING',  -- PENDING | MERGED | REJECTED
  resolved_by    uuid,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
```

### Сделки

```sql
create table deals (
  id                      uuid primary key default gen_random_uuid(),
  contact_id              uuid not null references contacts(id),
  amocrm_deal_id          bigint unique,
  pipeline                text not null,  -- PARTNER_ACQUISITION | PARTNER_ACTIVATION
  stage                   text not null,
  is_active               boolean not null default true,
  closed_reason           text,           -- NOT_TARGET | REFUSED | NO_CONTACT | NO_STONES
  responsible_manager_id  uuid references managers(id),
  automation_status       text not null default 'ACTIVE',
  automation_step         text not null default 'NEW',
  score                   int,
  rating                  text,           -- A | B | C
  score_reasons           jsonb,
  next_action_at          timestamptz,
  last_message_at         timestamptz,
  last_reply_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- пункт 3 ТЗ: не создавать дублирующую сделку, если есть активная.
-- гарантия на уровне БД, а не «сначала посмотрели, потом вставили»
create unique index deals_one_active_per_contact
  on deals (contact_id)
  where pipeline = 'PARTNER_ACQUISITION' and is_active;
```

### Импорт

```sql
create table import_batches (
  id             uuid primary key default gen_random_uuid(),
  filename       text not null,
  file_hash      text not null,
  source         text not null,
  status         text not null default 'NEW',
  total_rows     int not null default 0,
  processed_rows int not null default 0,
  success_rows   int not null default 0,
  duplicate_rows int not null default 0,
  failed_rows    int not null default 0,
  manual_rows    int not null default 0,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create table import_rows (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references import_batches(id) on delete cascade,
  row_number         int not null,
  raw_payload        jsonb not null,
  normalized_payload jsonb,
  status             text not null default 'NEW',
  contact_id         uuid references contacts(id),
  deal_id            uuid references deals(id),
  error_code         text,
  error_message      text,
  idempotency_key    text not null,
  correlation_id     uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- повторная загрузка того же файла не создаёт вторую обработку той же строки
create unique index import_rows_idempotency on import_rows (idempotency_key);
create index import_rows_batch_status on import_rows (batch_id, status);
```

### Каналы, лимиты, сообщения

```sql
create table channels (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,   -- TELEGRAM | WHATSAPP | EMAIL
  external_ref  text not null,   -- номер/аккаунт в шлюзе
  can_initiate  boolean not null default false,
  daily_limit   int not null default 20,
  send_window   jsonb not null,  -- {"from":"10:00","to":"19:00","weekdays":[1,2,3,4,5]}
  warmup_until  date,
  status        text not null default 'ACTIVE',  -- ACTIVE | PAUSED | BANNED
  created_at    timestamptz not null default now()
);

create table channel_usage (
  channel_id  uuid not null references channels(id),
  usage_date  date not null,
  sent_count  int not null default 0,
  primary key (channel_id, usage_date)
);

create table manager_limits (
  manager_id   uuid not null references managers(id),
  usage_date   date not null,
  daily_limit  int not null default 20,
  used_count   int not null default 0,
  primary key (manager_id, usage_date)
);

create table messages (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references contacts(id),
  deal_id             uuid references deals(id),
  channel_id          uuid references channels(id),
  channel_kind        text not null,
  direction           text not null,  -- INBOUND | OUTBOUND
  step                text,           -- FIRST | FOLLOWUP_D3 | FOLLOWUP_D7 | ...
  template_version_id uuid,
  rendered_body       text not null,  -- фактический текст, не ID шаблона
  external_message_id text,
  status              text not null default 'QUEUED',
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  failed_at           timestamptz,
  failure_reason      text,
  idempotency_key     text,
  correlation_id      uuid,
  created_at          timestamptz not null default now()
);

-- одно и то же касание не уйдёт дважды даже при повторе джобы
create unique index messages_idempotency
  on messages (idempotency_key) where idempotency_key is not null;

create index messages_deal_created on messages (deal_id, created_at desc);
create index messages_status_scheduled on messages (status, scheduled_at)
  where status = 'QUEUED';
```

### Suppression, квалификация, scoring

```sql
create table suppression_list (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references contacts(id) on delete cascade,
  identifier    text,             -- работает и без contact_id, по значению
  channel_kind  text,             -- null = все каналы
  level         text not null,    -- PAUSED_UNTIL | PERMANENT
  paused_until  timestamptz,
  reason        text not null,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create index suppression_lookup on suppression_list (contact_id, channel_kind);
create index suppression_identifier on suppression_list (identifier);

create table qualification_answers (
  id                     uuid primary key default gen_random_uuid(),
  deal_id                uuid not null references deals(id) on delete cascade,
  practices_jyotish      boolean,
  conducts_consultations boolean,
  prescribes_stones      text,   -- REGULARLY | SOMETIMES | NEVER
  has_supplier           boolean,
  monthly_consultations  text,   -- 0_5 | 5_20 | 20_50 | 50_PLUS
  cooperation_interest   text,   -- HIGH | MEDIUM | LOW
  comment                text,
  filled_by              uuid,
  filled_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index qualification_one_per_deal on qualification_answers (deal_id);

-- веса и пороги меняются бизнесом; в коде их держать нельзя
create table scoring_configs (
  id          uuid primary key default gen_random_uuid(),
  version     int not null unique,
  weights     jsonb not null,
  thresholds  jsonb not null,   -- {"A": 16, "B": 10}
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);
```

### Онбординг и атрибуция продаж

```sql
create table partners (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null unique references contacts(id),
  promo_code        text not null unique,
  referral_slug     text not null unique,
  connected_at      timestamptz,
  materials_seen_at timestamptz,
  first_referral_at timestamptz,
  first_sale_at     timestamptz,
  activity_status   text not null default 'CONNECTED',
  created_at        timestamptz not null default now()
);

create table referrals (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references partners(id),
  external_client_id text,
  attribution_type  text not null,  -- PROMO_CODE | REFERRAL_LINK | MANUAL
  created_at        timestamptz not null default now()
);

create table orders (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid references partners(id),
  referral_id       uuid references referrals(id),
  external_order_id text not null unique,
  amount            numeric(12,2) not null,
  currency          text not null default 'RUB',
  status            text not null,
  ordered_at        timestamptz not null,
  created_at        timestamptz not null default now()
);
```

### События и аудит

```sql
create table automation_events (
  id             bigserial primary key,
  contact_id     uuid references contacts(id) on delete set null,
  deal_id        uuid references deals(id) on delete set null,
  event_type     text not null,
  payload        jsonb,
  source         text not null,
  correlation_id uuid,
  created_at     timestamptz not null default now()
);

create index automation_events_contact on automation_events (contact_id, created_at desc);
create index automation_events_correlation on automation_events (correlation_id);
create index automation_events_type_date on automation_events (event_type, created_at desc);

create table audit_log (
  id          bigserial primary key,
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  diff        jsonb,     -- ПД замаскированы
  ip          inet,
  created_at  timestamptz not null default now()
);
```

## Гарантии, обеспеченные БД

Перечисляю отдельно, потому что это ответ на «критически важно, иначе CRM заполнится дублями»: ниже — инварианты, которые нельзя нарушить даже багом в коде.

| Инвариант | Механизм |
| --- | --- |
| Один идентификатор — один контакт | `unique (type, normalized_value)` |
| Не более одной активной сделки привлечения на контакт | partial unique index |
| Строка файла обрабатывается один раз | `unique (idempotency_key)` на `import_rows` |
| Касание не отправляется дважды | `unique (idempotency_key)` на `messages` |
| Один заказ учитывается один раз | `unique (external_order_id)` |
| Одна анкета квалификации на сделку | `unique (deal_id)` |
| Конкурентная обработка одного человека сериализуется | `pg_advisory_xact_lock` по хешу идентификатора |
| Счётчики лимитов не разъезжаются | `FOR UPDATE` на строке `channel_usage` / `manager_limits` |

## Аналитические вьюхи

Метрики п. 17 ТЗ считаются из `automation_events` набором вьюх `analytics_funnel`, `analytics_by_source`, `analytics_by_manager`, `analytics_partner_performance`, `analytics_delivery`. Тяжёлые — materialized, с ночным обновлением. Metabase на релизе 4 подключается к ним без доработок.
