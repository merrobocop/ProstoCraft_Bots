# ProstoCraft Bots

Менеджер Mineflayer-ботов для Paper 1.16.5 с UI (blessed), ротацией, лимбо-обходами и мониторингом.

## Требования

- Node.js >= 14
- Сервер Paper 1.16.5

## Установка

```bash
npm install
```

## Запуск

```bash
npm run start
```

## Dev-режим

```bash
npm run start:dev
```

## Тесты

```bash
npm test
```

## Линтинг/форматирование

```bash
npm run lint
npm run format
```

## Бенчмарк цикла копания

```bash
npm run bench
```

Результаты сохраняются в `bench/results.md`.

## Конфигурация

Основной файл — `config.json`. Поддерживается обратная совместимость с существующими полями.
Ниже ключевые параметры:

- `timing.digDelay` — задержка между успешными dig.
- `timing.stuckThreshold` — таймаут «застревания».
- `timing.minReconnectInterval` — минимальный интервал между переподключениями.
- `timing.startStagger`/`timing.startStaggerJitter` — разведение старта ботов во времени.
- `logging.toFile`/`logging.filePath` — логирование в файл и путь.

## Troubleshooting

- **Logging in too fast**: увеличьте `timing.minReconnectInterval` и `timing.startStagger`.
- **Нет блоков в списке**: проверьте координаты `blocksToMine` и загрузку чанков.

## Примеры логов

```
[INFO] [SYSTEM] Менеджер ботов запущен
[SUCC] [Bot1] Начинаю копать
[WARN] [Bot1] Чанк не загружен (10 попыток)
```
