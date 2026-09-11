MAX_CALLBACK_PAYLOAD_MAX_BYTES = 4096

BOT_COMMANDS = [
    {"name": "start", "description": "Главное меню"},
    {"name": "catalog", "description": "Каталог товаров"},
    {"name": "random", "description": "Случайный товар"},
    {"name": "publish", "description": "Создать публикацию"},
    {"name": "schedule", "description": "Расписание"},
    {"name": "history", "description": "История публикаций"},
    {"name": "settings", "description": "Настройки"},
    {"name": "help", "description": "Справка"},
]

WEBHOOK_UPDATE_TYPES = [
    "message_created",
    "message_callback",
    "bot_started",
    "bot_added",
    "message_edited",
    "message_removed",
]
