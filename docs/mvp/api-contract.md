# Контракт API Drive2U MVP

Контракт погоджений координатором перед розділенням робіт backend/mobile.
Це ціль реалізації; фактичне приймання й результати перевірок фіксуються окремо.
База: `6ffb4e2cd6d19dee0fbda0f469ec565df9d58956`, гілка `feat/working-mvp`.

JSON використовує camelCase, час — ISO8601 UTC, ідентифікатори — непрозорі рядки.
Суми й відстані серіалізуються як JSON numbers; сервер обчислює ціну типом decimal.
Валюта тільки `UAH`. Клієнт не визначає ціну, дорожню відстань або роль.

## Облікові записи

| Метод і шлях | Запит | Успішна відповідь |
| --- | --- | --- |
| POST `/api/auth/register` | `{name,email,password}` | Session |
| POST `/api/auth/login` | `{email,password}` | Session |
| POST `/api/auth/logout` | Поточний bearer token | 204 |
| GET `/api/me` | Bearer token | User |

Реєстрація створює тільки Passenger. Запит не приймає поле role; зайві поля
відхиляються. Паролі обробляє ASP.NET Core Identity. Сесія має випадковий
256-bit bearer token; БД зберігає тільки SHA256 hash, користувача, expiry та
revocation. Строк дії обмежений; після expiry потрібен повторний вхід.
Вихід відкликає поточну сесію. Збереження сесії не залежить від пам’яті процесу.
Мобільний клієнт зберігає токен у SecureStore й очищує його після виходу/401.

```typescript
type Vehicle = { make: string; model: string; plate: string };
type User = {
  id: string;
  name: string;
  email: string;
  role: 'Passenger' | 'Driver';
  driverProfile: null | {
    approved: boolean;
    available: boolean;
    vehicle: Vehicle;
  };
};
type Session = { accessToken: string; expiresAt: string; user: User };
```

Лише Development seed: `passenger@drive2u.test` та `driver@drive2u.test`,
обом початковий пароль `Drive2U!Demo2026`. Це вигадані демонстраційні акаунти,
не production-секрети. Seed повторюваний без дублікатів, водій допущений,
автомобіль заповнений, початкова доступність false. В інших середовищах
демонстраційні користувачі автоматично не створюються.

## Місця, маршрути та пропозиції

| Метод і шлях | Запит | Успішна відповідь |
| --- | --- | --- |
| GET `/api/config` | — | `{routingMode:'Demo'|'Live',quoteLifetimeSeconds:number}` |
| GET `/api/locations` | — | Location[] |
| POST `/api/quotes` | `{pickup:Point,destination:Point,routingMode:'Demo'|'Live'}` | Quote |

Quote потребує Passenger. Обидві точки перевіряються сервером на коректність,
різність та належність до львівської зони. Вибір відомої локації й натискання
на мапу використовують той самий Point. Сервіс повертає тільки підтверджений
server route; клієнтські distance/amount не приймаються.

```typescript
type Coordinate = { latitude: number; longitude: number };
type Location = Coordinate & { id: string; name: string };
type Point = Coordinate & { address: string; locationId?: string };
type Route = {
  distanceKm: number;
  durationSeconds: number;
  geometry: Coordinate[];
  isDemo: boolean;
  attribution: string;
};
type Quote = {
  id: string;
  pickup: Point;
  destination: Point;
  route: Route;
  amount: number;
  currency: 'UAH';
  expiresAt: string;
};
```

`routingMode` у config — серверний default, а в quote — явний вибір користувача.
Demo підтримує лише заздалегідь визначені пари львівських локацій і повертає
явно позначені демонстраційні дані. Довільні точки не підміняються найближчою
парою непомітно. Live викликає серверний провайдер з timeout. Недоступність
провайдера — зрозуміла помилка, без переходу в Demo або прямої лінії замість дороги.

FareQuote зберігає пасажира, строк дії, координати/адреси, маршрут, відстань,
тривалість та snapshot тарифу/ціни. Ціна використовує існуючий FareCalculator:
`BaseFare + DistanceKm * RatePerKm`, одне кінцеве округлення AwayFromZero до 2 знаків.

## Поїздки

Усі наступні endpoints потребують bearer token і перевіряють роль/власника.

| Метод і шлях | Запит | Успішна відповідь |
| --- | --- | --- |
| POST `/api/rides` | `{quoteId:string,idempotencyKey:string}` | Ride |
| GET `/api/rides/active` | — | Ride або null |
| GET `/api/rides/history?page=1&pageSize=20` | Пагінація | `{items:Ride[],page,pageSize,total}` |
| GET `/api/rides/{id}` | — | Ride, лише учасникам |
| GET `/api/driver/orders` | — | Ride[] для доступних Waiting; passenger=null |
| PUT `/api/driver/availability` | `{available:boolean}` | User |
| POST `/api/rides/{id}/accept` | `{}` | Ride |
| POST `/api/rides/{id}/status` | `{status:'Arrived'|'InProgress'|'Completed'}` | Ride |
| POST `/api/rides/{id}/cancel` | `{reason:string}` | Ride |

```typescript
type RideStatus =
  | 'Waiting' | 'Accepted' | 'Arrived' | 'InProgress' | 'Completed' | 'Cancelled';
type Ride = {
  id: string;
  status: RideStatus;
  version: number;
  pickup: Point;
  destination: Point;
  route: Route;
  amount: number;
  currency: 'UAH';
  createdAt: string;
  updatedAt: string;
  passenger: null | { id: string; name: string };
  driver: null | { id: string; name: string; vehicle: Vehicle };
  cancellation: null | { by: string; reason: string; at: string };
};
```

Деталі доступні лише пасажиру та призначеному водію. Список Waiting для водія
не розкриває особу/контакти пасажира; passenger=null. Історія містить тільки
власні кінцеві Completed/Cancelled поїздки.

Quote підтверджує тільки його пасажир до expiresAt. Пара passenger/idempotencyKey
унікальна: повтор того самого ключа/quote повертає початкову поїздку навіть
після expiry; той самий ключ з іншим quote відхиляється409. Повтор підтвердження
вже використаного quote не створює другу поїздку. Пасажир має не більше однієї
активної Waiting/Accepted/Arrived/InProgress поїздки.

Водій приймає лише Waiting, коли він available, approved, має заповнений vehicle
та не має активної Accepted/Arrived/InProgress поїздки. SQLite immediate write
transaction та індекси забезпечують один успішний accept при конкуренції;
інший запит отримує409. Прийняття та скасування перевіряються в тій самій
транзакційній моделі, без частково застосованих змін.

Дозволені переходи збігаються з FR06/FR07 та чинним MCP Ride-Lifecycle:

| Зі стану | У стан | Виконавець |
| --- | --- | --- |
| Waiting | Accepted | Допущений доступний водій |
| Accepted | Arrived | Призначений водій |
| Arrived | InProgress | Призначений водій |
| InProgress | Completed | Призначений водій |
| Waiting | Cancelled | Власний пасажир |
| Accepted | Cancelled | Власний пасажир або призначений водій |
| Arrived | Cancelled | Призначений водій |

Причина відмови водія обов’язкова (1–300 символів після trim). Сервер зберігає
ініціатора, причину та UTC час. Пропуск етапів і зміни terminal status відхиляються409.
Зміна availability не змінює існуючу поїздку. Погоджені route/amount/tariff не редагуються.

## Події та відновлення

SignalR endpoint `/hubs/rides`; клієнт передає поточний bearer token.
Сервер сам обирає групу автентифікованого userId; публічного JoinRide методу немає.
Після commit надсилається `RideChanged {rideId:string,version:number,status:RideStatus}`
лише пасажиру та призначеному водію. Подія не містить чужих контактів чи маршруту.

Клієнт перечитує API після події, reconnect і повернення на foreground. Поки
realtime недоступний, працює контрольоване періодичне API refresh. Статус/історія
не залежать від відкритого сокета; старі version не відкидають UI назад.

## Помилки та зворотна сумісність

Помилки мають ProblemDetails `{status:number,title:string,detail?:string,code?:string}`.
401 — відсутня/прострочена/відкликана сесія, 403 — невідповідна роль, 404 —
неіснуюча або недоступна чужа поїздка, 409 — конфлікт життєвого циклу/конкуренції,
400 — невалідний запит, 503 — недоступна маршрутизація. Жодних stack traces,
токенів або raw provider errors. Клієнт показує зрозумілий український текст.

Чинні `/health` та `/api/fare-estimates` зберігаються для сумісності тестів;
`/api/fare-estimates` не створює FareQuote і не використовується для підтвердження поїздки.

## Перевірка Android

Планування не підтверджує перевірку інтерфейсу на Android. API smoke, mobile Jest,
typecheck та Expo compatibility є окремими перевірками. Якщо adb/SDK/пристрій
недоступні, фінальна документація має прямо вказувати це й містити точний
ручний сценарій на Android; APK не заявляється без фактичної збірки.
