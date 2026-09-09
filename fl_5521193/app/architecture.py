"""Architecture blueprint for customer/dev estimation (prod target stack)."""

PIPELINE = [
    "Источник базы",
    "Импортёр / ETL",
    "Нормализация + дедуп",
    "amoCRM API",
    "Оркестратор сценариев",
    "Канал коммуникации",
    "Webhook входящего",
    "amoCRM + задача менеджеру",
    "Аналитика и отчёты",
]

COMPONENTS = [
    {"name": "amoCRM", "role": "Контакты, сделки, задачи, воронки", "tools": "API v4, webhooks"},
    {"name": "Backend-интегратор", "role": "Бизнес-логика и синхронизация", "tools": "NestJS + TypeScript"},
    {"name": "Очереди", "role": "Задержки, лимиты отправки", "tools": "Redis + BullMQ"},
    {"name": "БД интеграции", "role": "Идемпотентность, логи, состояния", "tools": "PostgreSQL"},
    {"name": "Импорт", "role": "CSV/XLSX/API, валидация", "tools": "fast-csv, SheetJS, Zod"},
    {"name": "Telegram", "role": "Только разрешённые способы", "tools": "Bot API / Business"},
    {"name": "WhatsApp", "role": "Официальный канал", "tools": "WhatsApp Business Platform"},
    {"name": "Email", "role": "Альтернатива и follow-up", "tools": "SES / SendGrid / Mailgun"},
    {"name": "Мониторинг", "role": "Ошибки, задержки, блокировки", "tools": "Sentry + Grafana"},
    {"name": "Admin UI", "role": "Импорт, превью, контроль", "tools": "React + Vite"},
]

PRINCIPLE = (
    "amoCRM — рабочий UI менеджеров. Отдельный backend — интеграция, дедуп, очереди, "
    "идемпотентность, ретраи, аудит. Не держать всю логику только в amoCRM-роботах."
)

STAGES = [
    {
        "id": 0,
        "title": "Уточнение бизнес-правил",
        "outcome": "Словарь данных + таблица правил",
        "items": [
            "Обязательные поля и уникальные идентификаторы",
            "Каналы первого этапа",
            "Что считать активной сделкой",
            "Позитив / негатив / нейтральный ответ",
            "Пороги A/B/C и события «подключён» / «активный»",
            "Лимиты менеджер / аккаунт / канал",
            "Повтор после «напишите через месяц»",
        ],
    },
    {
        "id": 1,
        "title": "Модель данных",
        "outcome": "Mapping база ↔ amoCRM + PostgreSQL",
        "items": [
            "Поля контакта / сделки / квалификации",
            "amo_contact_id + внешний import id",
            "Нормализованные ключи и история дублей",
        ],
    },
    {
        "id": 2,
        "title": "Импорт базы",
        "outcome": "CSV/XLSX → import_batch + отчёт",
        "items": [
            "Валидация колонок и кодировки",
            "Дубли внутри файла",
            "Статусы NEW…IMPORTED/FAILED",
            "Идемпотентный повторный запуск",
        ],
    },
    {
        "id": 3,
        "title": "Нормализация",
        "outcome": "E.164, email, TG id/username, канон URL",
        "items": [
            "Телефон без автоподстановки кода страны без правила",
            "Username ≠ постоянный ID",
            "Оригинал ссылки + канон + extracted username",
        ],
    },
    {
        "id": 4,
        "title": "Дедупликация",
        "outcome": "Exact + possible match + locks",
        "items": [
            "Порядок: телефон → Telegram → email → link/username",
            "Possible match → ручная проверка",
            "Enrich + skip active deal",
            "Redis lock / unique keys",
        ],
    },
    {
        "id": 5,
        "title": "Интеграция amoCRM",
        "outcome": "OAuth, CRUD, webhooks, retries",
        "items": [
            "Custom fields, pipelines mapping",
            "internal_stage ↔ amocrm_status_id",
            "Rate limits + p-retry",
            "Двусторонняя синхронизация",
        ],
    },
    {
        "id": 6,
        "title": "Воронки",
        "outcome": "Привлечение + активация партнёра",
        "items": [
            "Не смешивать длинную воронку",
            "После подключения — отдельный onboarding",
        ],
    },
    {
        "id": 7,
        "title": "Назначение менеджера",
        "outcome": "Round-robin + лимиты",
        "items": [
            "Активность, отпуск, дневной лимит, канал аккаунта",
        ],
    },
    {
        "id": 8,
        "title": "Сценарий коммуникаций",
        "outcome": "D0/D3/D7/D14/D30 + automation_status",
        "items": [
            "BullMQ delayed jobs (MVP)",
            "Проверки reply / stop / limit / channel / idempotency",
        ],
    },
    {
        "id": 9,
        "title": "Каналы и ограничения",
        "outcome": "MessagingProvider abstraction",
        "items": [
            "Нельзя строить на «username → автосообщение»",
            "Telegram / WhatsApp / Email — отдельные провайдеры",
            "Consent, opt-out, suppression",
        ],
    },
    {
        "id": 10,
        "title": "Персонализация",
        "outcome": "Шаблоны + fallback + версии",
        "items": ["Handlebars/Mustache", "Сохранять фактический текст"],
    },
    {
        "id": 11,
        "title": "Входящий ответ",
        "outcome": "Отдельные события, не монолит",
        "items": [
            "message_received",
            "automation_stopped",
            "deal_stage_changed",
            "manager_notified",
        ],
    },
    {
        "id": 12,
        "title": "Тип ответа",
        "outcome": "Rules first, LLM later",
        "items": [
            "POSITIVE / NEGATIVE / LATER / QUESTION / OPT_OUT / UNKNOWN",
            "LLM без автоотправки, со structured output",
        ],
    },
    {
        "id": 13,
        "title": "Квалификация и scoring",
        "outcome": "Конфигурируемые веса и пороги",
        "items": ["A ≥18", "B 10–17", "C 0–9"],
    },
    {
        "id": 14,
        "title": "После интереса",
        "outcome": "Задача + SLA, дальше человек",
        "items": ["Интерес → задача → календарь"],
    },
    {
        "id": 15,
        "title": "Онбординг партнёра",
        "outcome": "Связка с продажами AstroStone",
        "items": ["Рекомендация → клиент → продажа → активный"],
    },
    {
        "id": 16,
        "title": "Аналитика",
        "outcome": "Event-driven funnel + Metabase",
        "items": ["Не только текущий статус сделки", "Метрики по источникам/каналам/менеджерам"],
    },
    {
        "id": 17,
        "title": "Логирование",
        "outcome": "Техлог + бизнес-аудит + журнал рассылки",
        "items": [],
    },
    {
        "id": 18,
        "title": "Безопасность",
        "outcome": "Secrets, RBAC, GDPR/PECR-ready",
        "items": ["Opt-out, webhook signatures, минимизация ПДн"],
    },
]

PHASES = [
    {
        "id": 1,
        "title": "MVP",
        "items": [
            "Импорт CSV/XLSX",
            "Нормализация + дедуп",
            "Контакты/сделки в amoCRM",
            "Назначение менеджера",
            "Ручное подтверждение перед первой отправкой",
            "Один разрешённый канал",
            "Стоп по ответу",
            "Базовый лог + dashboard",
        ],
        "demo_covers": True,
    },
    {
        "id": 2,
        "title": "Автоматизация",
        "items": [
            "Delayed jobs D0–D30",
            "Персонализация + лимиты",
            "Scoring + автопереходы",
            "Retry + DLQ",
        ],
        "demo_covers": True,
    },
    {
        "id": 3,
        "title": "Партнёрский онбординг",
        "items": [
            "Вторая воронка",
            "Атрибуция продаж",
            "Отчёт активных партнёров",
        ],
        "demo_covers": True,
    },
    {
        "id": 4,
        "title": "Оптимизация",
        "items": [
            "A/B шаблонов",
            "LLM-классификация ответов",
            "Приоритизация базы",
        ],
        "demo_covers": False,
    },
]

STACK = {
    "Backend": "Node.js + TypeScript + NestJS",
    "CRM": "amoCRM API v4 + webhooks",
    "Database": "PostgreSQL",
    "Queue": "Redis + BullMQ",
    "Frontend": "React + Vite",
    "Validation": "Zod",
    "CSV/XLSX": "fast-csv + SheetJS",
    "Templates": "Handlebars",
    "Testing": "Vitest + Testcontainers + Playwright",
    "Monitoring": "Sentry + OpenTelemetry",
    "Dashboards": "Metabase",
    "Deploy": "Docker + GitHub Actions",
}

RISKS = [
    {
        "title": "Telegram и первое сообщение",
        "detail": "Не проектировать рассылку вокруг username. Сначала подтвердить легальный канал.",
    },
    {
        "title": "Дубли",
        "detail": "Один человек = несколько профилей. Нужны нормализация + журнал решений.",
    },
    {
        "title": "Повторная отправка",
        "detail": "Idempotency keys и unique constraints при retry/webhook replay.",
    },
    {
        "title": "Ошибочная остановка цепочки",
        "detail": "Единый automation_stopped перед каждой отправкой.",
    },
    {
        "title": "CRM ≠ продажи",
        "detail": "Активность партнёра и выручка — из источника продаж, не только статусы amoCRM.",
    },
    {
        "title": "Антиспам и репутация",
        "detail": "10–30/день — ориентир. Факт зависит от канала, аккаунта и реакций.",
    },
]

EPICS = [
    {
        "id": "EPIC-1",
        "title": "Проектирование",
        "tasks": ["Словарь полей", "Воронки", "Правила дедупа", "Каналы"],
    },
    {
        "id": "EPIC-2",
        "title": "Импорт",
        "tasks": ["CSV", "XLSX", "Нормализация телефонов", "TG/ссылки", "Отчёт ошибок"],
    },
    {
        "id": "EPIC-3",
        "title": "amoCRM",
        "tasks": ["OAuth", "Custom fields", "Контакты", "Сделки", "Webhooks"],
    },
    {
        "id": "EPIC-4",
        "title": "Дедупликация",
        "tasks": ["Phone", "Telegram", "Email", "Profiles", "Locks"],
    },
    {
        "id": "EPIC-5",
        "title": "Коммуникации",
        "tasks": ["Provider", "Шаблоны", "Очередь", "Лимиты", "Delivery", "Stop on reply"],
    },
    {
        "id": "EPIC-6",
        "title": "Квалификация",
        "tasks": ["Поля", "Scoring", "Автопереходы", "Задачи"],
    },
    {
        "id": "EPIC-7",
        "title": "Аналитика",
        "tasks": ["Event log", "Воронка", "Каналы", "Менеджеры", "Продажи"],
    },
    {
        "id": "EPIC-8",
        "title": "Надёжность",
        "tasks": ["Sentry", "Retry", "DLQ", "Backup", "Security review"],
    },
]

DEMO_VS_PROD = [
    {"area": "amoCRM", "demo": "In-memory симуляция сущностей", "prod": "API v4 + webhooks"},
    {"area": "Очереди", "demo": "Симуляция дней D0–D30", "prod": "Redis + BullMQ delayed jobs"},
    {"area": "Канал", "demo": "Фейковая доставка + legal note", "prod": "Разрешённый MessagingProvider"},
    {"area": "Импорт", "demo": "20 TG лидов в коде", "prod": "CSV/XLSX + import_batch"},
    {"area": "Дедуп", "demo": "Exact match phone→TG→email→link", "prod": "+ possible match + locks"},
    {"area": "Аналитика", "demo": "Dashboard KPI", "prod": "Event store + Metabase"},
]

START_WITH = (
    "Не с рассылки. С четырёх оснований: модель данных → импорт → дедуп → "
    "проверка допустимого канала первого контакта. Потом касания, scoring, партнёрская аналитика."
)


def blueprint() -> dict:
    return {
        "principle": PRINCIPLE,
        "start_with": START_WITH,
        "pipeline": PIPELINE,
        "components": COMPONENTS,
        "stages": STAGES,
        "phases": PHASES,
        "stack": STACK,
        "risks": RISKS,
        "epics": EPICS,
        "demo_vs_prod": DEMO_VS_PROD,
        "scoring": {
            "weights": {
                "vedic": 3,
                "consultations": 3,
                "stones_regular": 5,
                "no_supplier": 3,
                "consults_20_50": 4,
                "consults_50_plus": 5,
                "interest_high": 5,
                "interest_mid": 3,
                "interest_low": 1,
            },
            "tiers": {"A": "18+", "B": "10–17", "C": "0–9"},
        },
    }
