# Перевірка Drive2U MVP

Гілка feat/working-mvp створена від `origin/main` SHA
`6ffb4e2cd6d19dee0fbda0f469ec565df9d58956` після fetch.
Це живий журнал; готовність визначається лише результатами нижче.

## Середовище й вимоги

- Node.js 26.3.1, npm 11.16.0, .NET SDK 10.0.301, runtime 10.0.9,
  Java 25.0.3. Android SDK, adb, emulator не знайдені; debug APK і перевірка
  Android UI на цьому стенді поки не виконані.
- Вимоги: `docs/app-requirements.md` FR-01–FR-10. MCP 1.4.0 search і get_note
  Ride-Lifecycle revision `d8bd7e877838fe69447de968b7650c358cd631d671122b5d17f8ece9078e8553`,
  Fare-Quote revision `22050ecb45f1a83467fc2aba8d628e8f346b9a577044fda08c634de45b0523d9`,
  Mapping-Integration revision `f110afb8302657ace6de1fc7db3f28ff55c8d91d01f57293081619c6c4d109e4`.
  FR-07 збігається з чинним Ride-Lifecycle; правила скасування не змінено.
- Expo 58.0.19 engines за npm: Node ^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0;
  Node 26.3.1 сумісний за цим критерієм. Expo SDK 58, WebView і SecureStore
  звірені з офіційними посиланнями у [maps.md](maps.md). Реальне
  `expo install --check`/doctor/bundle наведено нижче окремо.

## Проміжний стан реалізації

Після перерваних агентних сеансів перша збірка API мала 3 NU1903 warnings
щодо старих транзитивних SQLite та SignalR пакетів; залежності оновлено,
результат чистої збірки нижче. Перший mobile `npm run typecheck` зупинився
на відсутньому `src/RideMap`; після додавання локальної Leaflet-мапи
`npm run typecheck` пройшов (exit 0). Це історичні діагностичні результати;
Jest/Expo/device gates розглянуто окремо нижче.

## Підтверджений API smoke — 2026-10-26

`dotnet build server/Drive2U.slnx -c Release --no-restore -v quiet` після
оновлення NuGet пакетів і створення міграції: **0 errors, 0 warnings**.
Ізольований `powershell -NoProfile -ExecutionPolicy Bypass -File
server/scripts/mvp-smoke.ps1 -EvidencePath docs/mvp/api-smoke.json` успішний:
14 assertions, окрема SQLite БД у ignored server/TestResults, два облікові
записи, quote з явним Demo маршрутом, ідемпотентний Waiting, логін після
виходу, driver availability/accept, Arrived/InProgress/Completed, однакова
версія стану в обох клієнтів, незмінна погоджена сума та історія після
перезапуску API. Повний raw результат без токенів: [api-smoke.json](api-smoke.json).
Два початкові невдалі запуски виявили помилки саме smoke-клієнта PowerShell:
відсутній Authorization на locations і обгорнутий масив відповіді; виправлені
до успішного запуску. Це не є Android UI перевіркою.

## Обов’язкові gates

API: locked restore, Release build, усі xUnit тести та ізольований
`server/scripts/mvp-smoke.ps1` із login → quote → idempotent order → driver
availability/accept → Arrived → InProgress → Completed → history після restart.
Окремо: негативні auth/role/owner/quote/transition/cancellation, конкурентне
прийняття на SQLite й SignalR доступ.

Mobile: `npm ci`, TypeScript typecheck, Jest/RNTL, Expo compatibility/export.
Android UI: якщо emulator/device недоступний, ручні кроки для фізичного
телефону містяться в кореневому README, а відсутність локальної device
перевірки залишиться явною.

Історична проміжна Expo-перевірка: `npx expo install --check` → Dependencies are up to date.
Перший `npx expo-doctor` → 18/20: app.json неузгоджений із app.config.ts,
`android.usesCleartextTraffic` не дозволений у Expo config schema. Mobile
агент виправив це перед фінальною перевіркою. Перші Jest/RNTL тести: 2 fail
через асинхронний test setup/overlapping act; це не результат приймання.
Backend перший новий набір: 39/45 (6 fail через WebApplicationFactory override
SQLite config); після виправлення фабрики й додавання SignalR-тесту агент
отримав 46/46, а після регресійного тесту валідації — фінальні 47/47.

## Фінальні локальні перевірки — 2026-10-26

Після наведених вище діагностичних запусків координатор повторив перевірки
на фінальному коді:

| Команда/сценарій | Результат |
| --- | --- |
| `dotnet restore server/Drive2U.slnx --locked-mode` | Успішно, зафіксовані пакети |
| `dotnet build server/Drive2U.slnx -c Release --no-restore -v quiet` | 0 errors, 0 warnings |
| `dotnet test server/Drive2U.slnx -c Release --no-restore -v quiet` | 47 passed, 0 failed/skipped |
| `server/scripts/mvp-smoke.ps1 -EvidencePath docs/mvp/api-smoke.json` | 14/14 перевірок, збереження після restart API |
| `npm run typecheck` | Успішно |
| `npm test -- --runInBand --silent` | 2 suites, 3 passed, без act warnings |
| `npx expo install --check` | Dependencies are up to date |
| `npx expo-doctor` | 20/20 checks passed |
| `npm run export:android` | Android Hermes bundle зібрано (2 MB), Expo export успішний |

Smoke повторено на фінальному API о 21:13:19 UTC; [api-smoke.json](api-smoke.json)
містить фактичний результат. Тести xUnit охоплюють захищені API, заборону
самопризначення водія, власника/прострочення quote, ідемпотентність,
переходи й скасування, конкуренцію двох водіїв на SQLite, перезапуск і
SignalR-доступ тільки учасників. Клієнтські тести перевіряють помилки API,
вибір точок і стан мапи. Android export підтверджує пакування JS/Hermes,
але не запуск інтерфейсу на пристрої.

`drive2u-review` прочитав тільки цільовий diff, вимоги, guardrails і релевантні
MCP-нотатки (MCP 1.4.0). Знайдено два P2: неявний Development cleartext у
`mobile/app.config.ts` і глобальна помилка `distanceKm` для всіх невалідних DTO
у `server/Drive2U.Api/Program.cs`. Перший виправлено явним `APP_VARIANT=development`:
Expo config дав `com.drive2u.demo / cleartext=true` в Development і
`com.drive2u.app / cleartext=false` у production. Другий виправлено розділенням
legacy fare estimate та MVP validation responses; новий xUnit regression test
увійшов до 47/47. Повторне read-only рев’ю підтвердило обидва виправлення,
інших P1/P2 не встановило. Рев’ю не проводило Android UI запуск.

Синхронізація знань документується окремо після commit підтвердженої реалізації.
