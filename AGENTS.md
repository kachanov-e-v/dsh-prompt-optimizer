# AGENTS.md

Руководство для AI-агентов, работающих с `dsh-prompt-optimizer`.

## Проект

- Плагин DSH (DeepSeek Harness) в виде Cordis-бандла.
- Две половины: `index.js` (Host, ESM, `apply(ctx, config)` + `inject`) и
  `client.js` (фабрика браузера `__ModuleLoader__`, React из таблицы модулей
  браузера).
- Без шага сборки, без TypeScript, без тест-раннера. Только чистый JavaScript.
- UI внедряется в слот `conversation.input.left`.

## Соглашения

- Обе половины должны быть без зависимостей (никаких `require` пакетов Harness).
- Host-половина должна декларировать `inject` для каждого используемого сервиса
  (`webServer`, опционально `llm`/`agentDefaultModel`/`connection` через
  `ctx.get`).
- Client-половина должна возвращать `{ inject, apply }` и регистрировать слоты
  через `ctx.slots.inject` + `ctx.slots.register`.
- Стилизация только токенами `--dsw-alias-*`; буквальные цвета — только для
  графики (иконка).
- Локализация UI по префиксу языка (`ru` / `zh` / `en`), не по точному id
  локали, так как DSH использует региональные id вроде `ru-RU`.
- Тела запросов ограничены и валидируются на стороне Host.
- Никогда не вызывать модель из клиента; всегда через Host-маршрут.

## Работа с кодом

- Редактировать `client.js` / `index.js` напрямую; шага компиляции нет.
- Проверка синтаксиса: `node --check client.js && node --check index.js`.
- Проверка JSON: разбор `package.json` и `locale/*.json`.
- SVG: должен разбираться как XML (`[xml](Get-Content icon.svg)`).
- Проверка состава пакета: `npm pack --dry-run --json` (кэш npm держать внутри
  рабочего каталога, иначе sandbox может запретить запись).
- Бандл связан с профилем из этого каталога; после правок переустановить через
  `plugin_manager install_bundle` (или удалить + установить) и перезагрузить
  страницу.
- Для проверки GitHub-установки использовать архив
  `.../archive/refs/heads/master.tar.gz`: он не зависит от TLS-бэкенда Git.
  Прямая git-спецификация на Windows может требовать
  `git config --global http.sslBackend openssl`; не менять глобальный конфиг
  без явного согласия пользователя.

## Не делать

- Не добавлять JSX или TypeScript — client-половина выполняется `__ModuleLoader__`
  как чистый JS.
- Не импортировать пакеты клиента Harness (`@deepseek-ai/dsh-client-*`) из
  client-половины; использовать сервисы `ctx` и `host.call`.
- Не хранить секреты в `config` или в репозитории.
- Не коммитить ad-hoc тестовые скрипты и артефакты сборки.

## Релиз

- Поднять `version` в `package.json` и синхронизировать версию в README.
- Прогнать проверки из раздела «Работа с кодом» и `npm pack --dry-run`.
- Переустановить бандл в профиле и проверить регистрацию слота через
  `cordis_inspect_query` (`Slots.listSubTree`, корень `conversation.input.left`).
- Закоммитить, поставить тег `vX.Y.Z`, запушить ветку `master` и тег.
- Проверить установку из GitHub по архивной ссылке тега/ветки (см. README) и
  сообщить, если для прямой git-спецификации нужен `http.sslBackend=openssl`.
