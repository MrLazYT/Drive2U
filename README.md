# Drive2U

Android-клієнт пасажира й водія та ASP.NET Core API для демонстрації замовлення
таксі у Львові. Поїздки, користувачі, пропозиції вартості та історія зберігаються
у SQLite. Оплата в інтерфейсі: **Готівка — демонстрація**, без списання коштів.

## Швидкий запуск

Потрібні Node.js, сумісний із зафіксованим Expo SDK, npm та .NET SDK із
`global.json`. Перевірене середовище й фактичне покриття: [перевірки MVP](docs/mvp/verification.md).

У PowerShell із кореня репозиторію:

```powershell
dotnet restore server/Drive2U.slnx --locked-mode
dotnet tool restore --tool-manifest server/dotnet-tools.json
dotnet build server/Drive2U.slnx -c Release --no-restore
$env:ASPNETCORE_ENVIRONMENT='Development'
dotnet run --project server/Drive2U.Api -c Release --no-build --no-launch-profile -- --urls http://0.0.0.0:5187
```

Під час Development запуску API застосовує EF Core migrations і повторюваний
seed. SQLite не видаляється при перезапуску. Місце БД і налаштування live routing
описані в [server/README.md](server/README.md). Не використовуйте Development
seed чи локальний HTTP для публічного розгортання.

В іншому терміналі:

```powershell
cd mobile
npm ci
$env:APP_VARIANT='development'
$env:EXPO_PUBLIC_API_URL='http://10.0.2.2:5187'
npm start
```

`10.0.2.2` — адреса хост-комп’ютера для Android Studio emulator. Для фізичного
Android замініть її **LAN IPv4 комп’ютера**, наприклад `http://192.168.1.20:5187`.
Development API приймає Host емулятора й LAN IP через `appsettings.Development.json`;
production `AllowedHosts` залишається обмеженим.
ПК і телефон мають бути в одній довіреній мережі; локальний firewall має дозволяти
порт 5187. Перевірте `http://LAN_IP:5187/health` у браузері телефону. `localhost`
телефону вказує на сам телефон. Відкрийте проєкт у сумісній версії Expo Go через
QR Metro (режим LAN); змінивши EXPO_PUBLIC_API_URL, перезапустіть Metro.
Налаштування URL централізоване; пароль/токен не є EXPO_PUBLIC змінними.

HTTP дозволений лише для явно локального Development через `APP_VARIANT=development`.
Без цієї змінної Expo-конфігурація використовує production package і забороняє
cleartext; для release build/API використовуйте HTTPS.

## Демонстраційні облікові записи

Автоматично створюються **лише в Development**, усі дані вигадані:

| Роль | Email | Початковий пароль |
| --- | --- | --- |
| Пасажир | passenger@drive2u.test | Drive2U!Demo2026 |
| Водій із автомобілем | driver@drive2u.test | Drive2U!Demo2026 |

Реєстрація створює лише пасажирів. Водія не можна самопризначити через застосунок.
Ці паролі призначені тільки для локальної демонстрації; не розгортайте таку БД
у production.

## Показ повного циклу

1. На першому клієнті увійдіть пасажиром. Натисніть «Звідки» й «Куди»,
   знайдіть дві різні адреси через Photon або оберіть точки на мапі. Отримайте
   серверну пропозицію, перевірте геометрію, відстань, час, UAH і строк дії.
2. Підтвердіть замовлення. З’явиться Waiting. Двічі натиснута/повторена
   операція не повинна створити другу поїздку.
3. На другому клієнті увійдіть водієм, увімкніть доступність, виберіть
   замовлення та прийміть його. Пасажир побачить водія й автомобіль.
4. Водій послідовно натискає прибуття, початок і завершення. Пасажир бачить
   поточний стан. При вимкненому realtime застосунок відновлює стан через API.
5. Відкрийте історію в обох ролях: та сама завершена поїздка з погодженою сумою.
6. Повторіть із скасуванням до початку: пасажир Waiting/Accepted; водій
   Accepted/Arrived із причиною. Кінцевий статус змінити не можна.

На одному телефоні можна вийти пасажиром, увійти водієм, виконати дії,
повторно увійти пасажиром. Стан належить серверу й збереженій БД, а не екрану.
Закрийте й відкрийте застосунок для перевірки SecureStore session restore.
Дозвіл GPS не потрібен для ручного вибору. Якщо він відхилений, пошук адрес
і вибір на мапі залишаються доступними. Нещодавні адреси зберігаються локально
окремо для кожного облікового запису; їх можна очистити в профілі.

## Мапа й зовнішні сервіси

Leaflet-мапа використовує тайли OpenStreetMap. Пошук під час введення та зворотне
геокодування використовують [Photon](https://github.com/komoot/photon); його
публічний demo API допускає помірне використання, але може обмежувати запити.
Дорожній маршрут і оплачувану відстань визначає API через
[OSRM demo FOSSGIS](https://routing.openstreetmap.de/about.html), максимум один
запит на секунду за умовами сервісу. Ключі та окремий сервер для локальної
демонстрації не потрібні. Для ширшого використання налаштуйте власні або
контрактні Photon і OSRM, задавши `EXPO_PUBLIC_PHOTON_URL` у Expo та
`Routing__OsrmBaseUrl` у середовищі API. При недоступності маршрутизатора ціна
не показується, автоматичної підміни маршруту немає. Правила тайлів:
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Перевірки й Android-збірка

```powershell
dotnet test server/Drive2U.slnx -c Release --no-build --no-restore
powershell -NoProfile -File server/scripts/mvp-smoke.ps1
cd mobile
npm run typecheck
npm test -- --runInBand
npx expo install --check
npx expo-doctor
```

API smoke запускає окремий локальний API/SQLite, проходить повний цикл,
перезапускає API й перевіряє історію обох учасників. Це **не** перевірка
Android UI. На стенді немає Android SDK/adb/emulator; APK не заявляється як
зібрана. Для локальної debug APK після окремого встановлення Android Studio,
відповідного SDK/JDK і налаштування ANDROID_HOME: у mobile виконайте
`$env:APP_VARIANT='development'; npx expo run:android --variant debug`.
Це створить ignored native build;
debug APK буде в `mobile/android/app/build/outputs/apk/debug/`. Збірка потребує
завантажень SDK/Gradle й не входить до встановлених тут системних інструментів.

Межі відкритого production запуску: операційна підтримка, TLS/backup, servicing
runtime, тарифне адміністрування та допуск водіїв, retention/видалення даних,
провайдерські квоти й навантажувальні вимірювання потребують окремого приймання.
Оплати, чат, рейтинги, автоматичний підбір і фонове GPS не входять у MVP.
