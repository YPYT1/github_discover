# GitHub Discover

**Меньше поиска. Больше открытий.** Пространство открытого кода под ваш технологический стек.

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)

![Главная страница](public/首页.png)

## Для любопытных

- Рекомендации по языкам, Topics, Star, сохранениям и просмотрам — с местом для небольших проектов.
- Исключение просмотренного, стабильная masonry-лента и подробности с сохранением позиции.
- Несколько языков/категорий, расширенные фильтры с пресетами, отменой и применением.
- Скруглённые карточки, уровни цвета Star/Fork, светлая/тёмная тема одним кликом, пять языков.
- GitHub OAuth или PAT, сохранённые проекты, история и настройки.

## Запуск

Поддерживаемый Node.js LTS 22+, pnpm 11+.

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

В PowerShell используйте `Copy-Item`. Откройте http://localhost:3000.
Для входа аккаунтом GitHub создайте OAuth App с callback `http://localhost:3000/api/auth/callback`. Укажите `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` в `.dev.vars`; `APP_URL` должен совпадать с адресом сайта.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Команда создаёт ключ шифрования. Без OAuth доступен PAT: он хранится только в браузере и временно передаётся серверу для проверки/пересылки. OAuth-токены шифруются на сервере.

## Демо и публикация

`pnpm demo:dev` запускает демо на 4173; `pnpm demo:build` создаёт `demo/dist`. Демо использует тот же интерфейс и помеченные примеры, без настоящей авторизации или записи.

- **Приложение**: https://github-discover.ypyt147.workers.dev
- **Демо**: https://github-discover-demo.ypyt147.workers.dev

Приложение использует Workers + D1 и реальные данные GitHub. Доступен вход по PAT; OAuth App ещё не настроено. Без серверного токена действуют строгие лимиты API.

[Демо](demo/README.md) · [Основное приложение](doc/Cloudflare部署.md) · [Технические заметки](doc/技术说明.md) (китайский)

Проверки: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm cf:build`. Внутри группы фильтров — OR, между группами — AND. Действуют ограничения GitHub API; трендам нужны исторические снимки. Независимый проект, не связанный с GitHub.
