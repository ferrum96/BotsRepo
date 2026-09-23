# Астробот

Telegram-бот: натальная карта, гороскоп дня, таро, ИИ-астролог, подписка Pro через Telegram Stars и Mini App.

## Запуск

```bash
cd fl_5522329
cp .env.example .env
# вписать BOT_TOKEN и OPENROUTER_API_KEY
docker compose up --build
```

Бот слушает long polling. HTTP API и собранный Mini App — на http://127.0.0.1:8080. Postgres с хоста: `127.0.0.1:55432`, Redis: `127.0.0.1:56379`.

Кнопка Mini App в чате появляется, только если `WEBAPP_URL` — публичный HTTPS. Без него дату рождения можно ввести командой `/profile`.

Локальная вёрстка Mini App:

```bash
cd miniapp
npm install
npm run dev
```

Для запросов вне Telegram включи `ALLOW_INSECURE_INIT_DATA=true` и заголовок `X-Dev-User-Id`. В проде флаг должен быть выключен.

## Команды

| Команда | Кто | Что делает |
| --- | --- | --- |
| `/start` | все | Дисклеймер при первом запуске, меню |
| `/profile` | все | Дата, время, место рождения |
| `/horoscope` | карта | Гороскоп дня по транзитам |
| `/tarot` | карта | 3 карты. Free: 1 раз в сутки |
| текст | карта | Вопрос астрологу. Free: 1 в сутки |
| `/pro` | все | Счёт Telegram Stars, 299 ₽/мес |
| `/synastry @user` | Pro | Совместимость двух карт |
| `/monthly` | Pro | Прогноз на месяц |
| `/invite` | все | Реферальная ссылка |

Счётчики Free живут в Redis и сбрасываются в 00:00 Europe/Moscow. Зеркало пишется в `daily_limits`. Pro лимиты не расходует.

Оплата в Telegram идёт в Stars (валюта `XTR`), не в рублях. `PRO_PRICE_STARS` — сколько звёзд списывать за месяц, который в продукте стоит 299 ₽.

## Стек

Python 3.11, aiogram 3, FastAPI, PostgreSQL, Redis, pyswisseph (дома, планеты, транзиты, прогрессии). flatlib 0.2.3 ставится отдельно с `--no-deps`: пакет на PyPI жёстко требует `pyswisseph==2.08.00-1`, а расчёт идёт на актуальном pyswisseph. Если flatlib импортируется, знак Солнца сверяется с ним; при расхождении остаётся swisseph. Если файлов Swiss Ephemeris нет, планеты считаются встроенным Moshier. ИИ: OpenRouter, модель `qwen/qwen-2.5-72b-instruct`. Mini App: React и `@telegram-apps/sdk-react`.

## Бэкапы

Сервис `backup-cron` запускает `pg_dump` каждый день в 03:15 UTC, хранит 14 архивов в `./backups`. Ручной запуск: `docker compose run --rm backup`. Пример crontab для хоста: `scripts/crontab.example`.

## Тесты

```bash
python3.11 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/pip install --no-deps flatlib==0.2.3
.venv/bin/pytest --cov
```

Покрытие считается по расчётам, лимитам, промпту, оплате и валидации. Обвязка aiogram и HTTP вынесена из отчёта: это тонкие хендлеры над теми же функциями.

## Вебхук

Если задан `WEBHOOK_URL` (полный HTTPS, например `https://host/webhook`), процесс не поллит, а принимает `POST /webhook`. `WEBHOOK_SECRET` уходит в Telegram как secret token.
