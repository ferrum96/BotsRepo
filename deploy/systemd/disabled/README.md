# Disabled systemd units

Unit-файлы здесь **не** копируются `deploy/deploy.sh` в `/etc/systemd/system/`.

Сейчас отключён `fkandu_manager_bot` (`fkandu-dashboard`, `fkandu-api`, `fkandu-bot`).

Чтобы вернуть:
1. Перенести `*.service` обратно в `deploy/systemd/`
2. Добавить имена сервисов в `SERVICES` в `deploy/deploy.sh`
3. Восстановить блоки сборки/pip в `deploy.sh` и server blocks 444–446 в `deploy/nginx/nginx-systemd.conf`
4. При HTTPS: `ENABLE_FKANDU=1` для `duckdns-*-caddy-setup.sh`
