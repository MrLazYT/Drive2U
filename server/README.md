# Drive2U server

Початковий ASP.NET Core API і незалежний модуль `Drive2U.Fares`. Реалізовані доступність API та демонстраційний калькулятор за клієнтською відстанню. Це **не Fare-Quote**: відстань недовірена, результат не фіксує ціну поїздки, не має quoteId/строку дії й не може підтверджувати замовлення. Повний FR-03 не завершений. Для майбутнього Fare-Quote дорожню відстань визначатиме серверна маршрутизація; потрібні snapshot тарифу, координати, строк дії та решта перевірок вимог.

## Передумови та залежності

У кореневому `global.json` зафіксовано стабільний SDK `10.0.301` (точний збіг, без prerelease); проєкти target `net10.0`. .NET 10 є LTS за [політикою Microsoft](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core). Політика потребує актуальних servicing updates. Фактичне середовище перевірки: Windows, SDK10.0.301, ASP.NET runtime10.0.9; runtime відстає від опублікованого10.0.13 станом на2026-10-24. Цією задачею системні оновлення не встановлювалися.

API використовує ASP.NET Core shared framework без сторонніх runtime-пакетів. Tests: Microsoft.AspNetCore.Mvc.Testing10.0.9, Microsoft.NET.Test.Sdk17.14.1, xunit.v3 3.2.2, xunit.runner.visualstudio3.1.4. Точні прямі версії в csproj, транзитивні залежності — у packages.lock.json. Встановлення SDK виконує розробник окремо; restore не встановлює системних інструментів.

## Відновлення, build і тести

Виконувати з кореня репозиторію:

```powershell
dotnet --version
dotnet restore server/Drive2U.slnx --locked-mode
dotnet build server/Drive2U.slnx -c Release --no-restore
dotnet test server/Drive2U.slnx -c Release --no-build --no-restore
```

Структура: `Drive2U.Fares` — immutable тариф/калькулятор; `Drive2U.Api` — конфігурація, DTO й HTTP; `Drive2U.Tests` — xUnit business/HTTP/startup tests. WebApplicationFactory перевіряє справжній HTTP pipeline на in-memory host; кожен test host має явно заданий тариф, без залежності від ambient configuration.

## Конфігурація і запуск

`Drive2U.Api/appsettings.json` містить **конфігураційний приклад**, не перевірений ринковий тариф: BaseFare=40, RatePerKm=12. Валюта завжди UAH. Обидва параметри обов’язкові, decimal і >=0; секція/ключі не можуть бути відсутніми. Некоректні значення зупиняють host під час запуску до готовності HTTP listener. Тариф фіксується для запущеного host; для зміни перезапустити API.

```powershell
# Необов’язкові server-side overrides; приклади, не ринкові дані.
$env:FareTariff__BaseFare = '40'
$env:FareTariff__RatePerKm = '12'
dotnet run --project server/Drive2U.Api -c Release --no-build --no-launch-profile -- --urls http://127.0.0.1:5187
```

Завершити ручний запуск через Ctrl+C. Для автоматизованої live-перевірки після Release build: `powershell.exe -NoProfile -File server/scripts/smoke.ps1`. Скрипт використовує HTTP loopback, задає тариф40/12 аргументами server process, перевіряє health/estimate і завершує лише створений ним процес у finally. Логи зберігаються в ignored `server/TestResults/`; параметр `-Port` змінює тестовий порт.

## HTTP-контракт

`GET /health` →200 `{"status":"ok"}`.

`POST /api/fare-estimates`, Content-Type `application/json`:

```json
{"distanceKm":2.5}
```

За server tariff40/12 →200:

```json
{"distanceKm":2.5,"amount":70.00,"currency":"UAH"}
```

JSON число може серіалізуватися як70.0: значення округлене до двох знаків, формат не гарантує два trailing zeros.

```powershell
Invoke-RestMethod http://127.0.0.1:5187/health
Invoke-RestMethod http://127.0.0.1:5187/api/fare-estimates -Method Post -ContentType 'application/json' -Body '{"distanceKm":2.5}'
```

Приймається тільки numeric distanceKm>0. Відсутній body/null/{}, null/нечислове/текстове/нульове/від’ємне distanceKm, malformed JSON, число поза decimal-діапазоном і arithmetic overflow →400 `application/problem+json` зі стабільною помилкою без exception details. Поля baseFare, ratePerKm, currency, amount та інші невідомі поля відхиляються400; вони не змінюють серверну конфігурацію. Непідтримуваний Content-Type стандартно відхиляє ASP.NET Core.

Калькулятор використовує виключно decimal: `BaseFare + DistanceKm * RatePerKm`; округлення лише кінцевої суми — `decimal.Round(amount,2,MidpointRounding.AwayFromZero)`. Тестується також midpoint1.005→1.01 і відсутність передчасного округлення доданків. Переповнення бібліотека явно сигналізує OverflowException; HTTP-межа перетворює його на безпечний400.

## Наступні інтеграції

Identity/права доступу, БД/EF Core/SQLite, тарифні версії, мапи/геокодування/серверна маршрутизація, повний Fare-Quote, створення й життєвий цикл замовлень, SignalR і mobile ще не реалізовані. Поточний локальний API не підтверджує production readiness чи виконання решти FR.

Докази запуску й оркестрації: [verification.md](../docs/orchestration/backend-fare/verification.md), [coder-handoff.json](../docs/orchestration/backend-fare/coder-handoff.json).
