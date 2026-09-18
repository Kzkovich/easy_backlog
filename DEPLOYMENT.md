# Публичный запуск «Колбасок»

Приложение хранит аккаунты и пользовательские планы в `/opt/kolbaski/data`. CI не удаляет и не перезаписывает эту директорию; `data/plan.json` копируется только при первом развёртывании.

## Первый запуск и аккаунт владельца

Оставьте текущий внешний `auth_basic` включённым на время первого деплоя. Первый зарегистрированный аккаунт автоматически получит существующий `data/plan.json`; все следующие аккаунты получат изолированный демо-план с двумя фичами. После регистрации владельца внешний Basic Auth можно отключить.

Если аккаунт владельца нужно создать без открытия интерфейса, до первого запуска новой версии можно добавить в `kolbaski.service`:

```ini
Environment=KOLBASKI_OWNER_USERNAME=your_login
Environment=KOLBASKI_OWNER_PASSWORD=use-a-long-random-password
Environment=KOLBASKI_SECURE_COOKIE=1
```

После `systemctl daemon-reload` и перезапуска сервис создаст аккаунт владельца один раз. Пароль хранится только в виде `scrypt`-хеша.

## Nginx

После создания аккаунта владельца уберите внешний `auth_basic` с сайта. Проксируйте `/api/` в Node-сервис и передавайте протокол, чтобы cookie всегда получал флаг `Secure`:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:5175;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Каталог `/opt/kolbaski/data` стоит включить в резервное копирование. В нём находятся `users.json`, отдельный `plan.json` и до 50 резервных копий на пользователя.
