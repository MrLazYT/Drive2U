# Перша серверна частина Drive2U

Дата: 2026-10-24. Початковий SHA: 0a5b3ac6e833619f07239ddd4eaf8cad1d27d653. Гілка feat/backend-fare-orchestration створена від feat/skills-engineering зі звітом чотирьох skills. Координатор: /root. Послідовні окремі ролі: Planner → Coder → Reviewer.

## Мета й межі

Створити server/: ASP.NET Core Web API, окремий модуль тарифної формули, xUnit unit/HTTP tests, solution і README. GET /health; POST /api/fare-estimates приймає лише distanceKm, повертає distanceKm/amount/currency. Decimal; BaseFare + DistanceKm * RatePerKm; одне округлення в кінці до 2 знаків AwayFromZero; UAH; distance>0; server-config BaseFare/RatePerKm>=0; invalid config відхиляється при запуску; invalid input/overflow=>400 ProblemDetails без деталей exception.

Цей estimate — демонстрація калькулятора на недовіреній клієнтській відстані. FR-03 вимагає серверного дорожнього маршруту й Fare-Quote із quoteId, expiry і snapshot; цей етап не виконує весь FR-03 і не створює Fare-Quote. Розбіжність обсягів зафіксована перед реалізацією; вимоги не змінюються. Identity/БД/SignalR/orders/maps/geocoding/routing/mobile — подальші інтеграції.

## Критерії

Звичайний розрахунок з явним синтетичним тарифом; midpoint; zero/negative distance; invalid tariffs/startup failure; request не змінює тариф/currency/amount; HTTP valid/missing/invalid/надмірне число; restore/build/test; живі health/calculation; завершення процесу. Документація дозволяє відтворити запуск. Приклади тарифу не є ринковими даними. Reviewer незалежний, без редагування; за дефектів повторити Coder → Reviewer.

## Дозволи та джерела

Дозволено server/, global.json, точні ignore-правила, harness/orchestration/, docs/orchestration/backend-fare/, залежності проєктів, локальний запуск, MCP-оновлення Backend-API, commit і звичайний push цієї гілки. Заборонено hooks/MCP/global config/knowledge-mcp, parse_note fix, сторонні файли, force push і merge main. Vault лише MCP.

Прочитані ЗАВДАННЯ.md, docs/app-requirements.md, harness-requirements.md, ontology.md, guardrails.md, docs/skills.md і обидва SKILL.md. AGENTS.md пошуком не виявлено. Початкові сторонні зміни: README (1).md deletion, tracked pyc modification, .codex/hook-probe-path.txt, hook-probe-* та .tmp-skills-*; не включати їх.

SDK: установлений 10.0.301, ASP.NET runtime 10.0.9. .NET 10 — стабільний LTS за https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core (перевірено 2026-10-24); global.json: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json. Офіційна політика вимагає актуальних patches; встановлений runtime 10.0.9 відстає від опублікованого 10.0.13. Системні оновлення не встановлювати; зафіксувати це як обмеження середовища.

MCP health 1.3.0 write_enabled=true, writer_busy=false, pending_push=false. get_note Backend-API, Fare-Quote, Route, ADR-001-Technology-Stack, ADR-002-Server-Authority повернули INVALID_YAML; search_notes підтверджує їх існування/ревізії, але не замінює успішне читання. Не переписувати наосліп. Після Reviewer повторити дозволений sync skill і зафіксувати блокер, якщо лишився.
