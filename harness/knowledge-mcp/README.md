# Drive2U Knowledge MCP

Локальний STDIO MCP-сервер для окремого Obsidian vault. Власний API-ключ OpenAI не потрібний: сервер не викликає LLM. Codex запускає процес і викликає типізовані інструменти.

## Комплект

- server.py — MCP-інструменти на офіційному Python SDK, підтримувана гілка 1.x, версія зафіксована.
- knowledge.py — валідація, retrieval, ingestion і git-синхронізація.
- requirements.txt / requirements-dev.txt — залежності.
- requirements-lock.txt — точний знімок залежностей перевіреного Python 3.12 середовища; основний спосіб встановлення — requirements.txt, оскільки платформи можуть відрізнятися.
- examples/codex-config.toml — приклад конфігурації без секретів.
- tests/ — тести з одноразовими локальними репозиторіями та справжнім MCP/STDIO.
- VERIFICATION.md — фактичні результати й сценарій приймання в IDE.

## 1. Розміщення

Скопіюйте каталог harness з архіву в корінь drive2u. Отримаєте drive2u/harness/knowledge-mcp/server.py. Vault залиште окремо:

```text
C:/Projects/drive2u/
C:/Projects/drive2u-knowledge/
```

Обидві папки мають бути коренями окремих git-репозиторіїв. У vault потрібен перший коміт, налаштований origin, upstream на однойменну гілку і файл MOC-Drive2U.md з метаданими. Назва гілки не обов’язково main: сервер визначає поточну гілку. Репозиторій може мати контрольоване git-автентифікування через Credential Manager або SSH; токен не вставляється в код чи URL origin.

У VS Code відкритий тільки drive2u. Сервер працює з окремим локальним клоном vault. Ця конфігурація сама по собі НЕ ізолює файлові інструменти агента — межу доступу потрібно забезпечити дозволами/ізоляцією середовища.

## 2. Встановлення на Windows

Потрібні Python 3.12+ і git у PATH. У PowerShell у корені drive2u:

```powershell
py -3.12 -m venv harness/knowledge-mcp/.venv
& ./harness/knowledge-mcp/.venv/Scripts/python.exe -m pip install -r harness/knowledge-mcp/requirements.txt
```

Активація venv не потрібна. Якщо встановлена інша сумісна версія Python, замініть -3.12 на її номер. На Linux/macOS аналогічно використовуйте python3 -m venv і .venv/bin/python.

Перевірте git у папці vault:

```powershell
git status
git branch -vv
```

Для початкового налаштування власного імені/пошти виконайте в vault git config user.name та git config user.email з ВАШИМИ значеннями. Для першої публікації використовуйте git push -u origin main, якщо ваша гілка main.

Сервер не видаляє сторонніх змін і не виконує reset, clean або stash. Перед ingestion дерево vault має бути чисте. Особисті налаштування Obsidian, якщо не хочете версіювати, додайте вручну в .git/info/exclude:

```text
.obsidian/
.trash/
```

Уже відстежувані файли ignore не приховає: спочатку погоджено збережіть свої зміни. Не додавайте реальні секрети до репозиторіїв.

## 3. Підключення Codex у VS Code

Відкрийте користувацький файл %USERPROFILE%/.codex/config.toml (звичайно C:/Users/ВАШ_КОРИСТУВАЧ/.codex/config.toml). ДОДАЙТЕ блок із examples/codex-config.toml до наявної конфігурації, не перезаписуйте інші параметри. Замініть C:/Projects на власний шлях у всіх значеннях.

Для локального Windows Codex використовуйте Scripts/python.exe. Якщо розширення працює у WSL, Python, git, шляхи та обидва клони мають бути доступні саме у WSL; шлях C:/... там не підходить.

Спочатку KNOWLEDGE_ALLOW_WRITE = "0": читання увімкнене, запис заблокований сервером. Після перевірки health_check і get_note змініть на "1", якщо дозволяєте інструменту записувати нотатки та публікувати коміти у vault. default_tools_approval_mode = "writes" запитує підтвердження для інструментів запису за підтримки встановленої версії Codex. Tool annotations — підказки клієнту, не заміна дозволів.

Перезапустіть розширення Codex або виконайте VS Code → Ctrl+Shift+P → Developer: Reload Window. Відкрийте нову сесію Codex. Перевірте сервер у налаштуваннях MCP. Якщо Codex CLI встановлений, додатково можна перевірити codex mcp list; CLI не обов’язковий для розширення.

Вручну запускати server.py в окремому терміналі для нормальної роботи не потрібно. Тривале очікування без тексту при прямому запуску нормально для STDIO: сервер очікує MCP-повідомлення.

## 4. Інструменти

| Інструмент | Параметри | Результат |
|---|---|---|
| health_check | немає | стан git, режим запису, pending push, кількість нотаток |
| get_note | note_id, наприклад Concepts/Ride.md | Markdown, метадані, SHA256 revision, поточний HEAD |
| search_notes | query, limit 1..50 | збіги назви/тексту, уривки, ревізії |
| ingest_note | title, note_type, content, source, links?, status?, expected_revision? | created / updated / unchanged, commit, published |

Retrieval читає локальний знімок без мережевої синхронізації; HEAD у відповіді показує ревізію. Пошук звичайний текстовий, без embeddings. Дозволені верхньорівневі MOC-Drive2U.md, Conventions.md і однорівневі нотатки в Concepts/, Components/, Decisions/, Glossary/. Інші файли, шляхи з .., симлінки та Windows junctions відхиляються.

Для ingestion:
- title — ім’я файлу без .md, латиниця/цифри/дефіс/підкреслення; note_type визначає папку.
- note_type — concept, component, decision або glossary.
- content — ПОВНИЙ новий текст нотатки, з заголовком, але без YAML frontmatter.
- source — точне джерело: вимога, файл або URL реального коміту. Це метадані походження, не команда й не автоматична гарантія достовірності; агент має перевірити джерело.
- links — список назв наявних нотаток без .md. Додається секція Related notes. Wiki-посилання в самому content теж перевіряються.
- status — planned/active/accepted/deprecated; типово planned.
- expected_revision — обов’язкова для зміни існуючої нотатки; отримайте через get_note. Для створення не передавайте. Якщо вміст уже ідентичний, повтор безпечний навіть із попередньою ревізією.

Перед записом: clean check → fetch → перевірка ahead/behind → fast-forward. Це еквівалент безпечного pull --ff-only, без злиття розбіжностей. Потім перевірка → запис → оновлення MOC → commit тільки цільових файлів → push. Автоматично оновлює існуючу нотатку за тим самим title/type, не генерує нову назву при кожному виклику. Порівняння семантичне для YAML/тіла; created та сторонні метадані зберігаються.

## 5. Перша перевірка через Codex

Запит для читання:

```text
Використай MCP-сервер drive2u_knowledge. Виклич health_check,
потім get_note з note_id="Concepts/Ride.md" і search_notes з query="маршрут".
Не читай vault через термінал або файлові інструменти.
Покажи назви викликаних інструментів і їхні фактичні результати.
```

Після ввімкнення запису:

```text
Через MCP прочитай наявні конвенції та нотатку Backend-API.
На основі фактично завершеного підключення knowledge MCP створи
component-нотатку Knowledge-Connector через ingest_note.
source має посилатися на реальний файл harness/knowledge-mcp/README.md
у drive2u. Опиши лише підтверджені можливості, зв’яжи з Backend-API
та Conventions. Потім повтори той самий ingest_note з тими самими
аргументами. Перевір status=unchanged, відсутність нового коміту
та published=true. Не називай GitHub MCP підключеним, доки він не підключений.
```

Для зміни існуючої нотатки спочатку get_note, потім передайте revision в expected_revision. Оскільки content замінюється повністю, збережіть увесь потрібний попередній текст.

Для 2–3 реальних подій беріть фактичні зміни репозиторію: створення документів вимог, створення vault, реалізація конектора — лише за наявності відповідних підтверджень. Отримання комітів через офіційний GitHub MCP — окремий крок; цей комплект його не налаштовує.

## 6. Збої та відновлення

| Код/стан | Дія |
|---|---|
| WRITES_DISABLED | Установіть KNOWLEDGE_ALLOW_WRITE="1" після погодження запису та перезапустіть Codex |
| DIRTY_VAULT | Перегляньте git status; самостійно збережіть/закомітьте сторонні зміни |
| EXPECTED_ORIGIN_UPSTREAM / git config failed | Налаштуйте origin і upstream поточної гілки |
| UNPUBLISHED_OR_DIVERGED_COMMITS | Перегляньте історію й синхронізуйте вручну; сервер не публікує чужі локальні коміти |
| REVISION_CONFLICT | Повторіть get_note, узгодьте новий вміст, передайте актуальну revision |
| LOCAL_COMMIT_FAILED | Файли та індекс збережені. Перевірте git-ідентичність/hooks, заверште або відновіть зміни вручну |
| published=false | Локальний коміт існує, віддалена публікація не підтверджена. Повторіть той самий запит після виправлення auth/мережі |
| PENDING_PUSH_FAILED | Перевірте права, мережу та remote. Немає force push або автоматичного rebase |
| PENDING_PUSH_REQUIRES_MANUAL_RECOVERY | HEAD/гілка змінилися після невдалого push. Перегляньте .git/drive2u-pending.json та історію; не видаляйте маркер навмання |

При невдалому push маркер із commit/branch зберігається в git-dir. Наступний ingestion може опублікувати саме цей коміт без нового. Якщо маркер ще є після ручного push, повторний безпечний push підтвердить публікацію. Зміна нотатки й MOC — дві файлові операції, єдина git-фіксація; аварія до коміту може залишити dirty tree. Автоматичного руйнівного відкату немає.

Сервер серіалізує свої операції файловим lock. Obsidian та інші редактори цей lock не враховують: під час ingestion не редагуйте vault паралельно. Git credential helper/SSH налаштовуються власником. Помилки git повертаються кодами без сирого stderr, щоб не розкрити credentials. Локальні hooks git виконуються як частина git; працюйте лише з довіреними репозиторіями.

## 7. Автоматизовані перевірки

У корені drive2u:

```powershell
& ./harness/knowledge-mcp/.venv/Scripts/python.exe -m pip install -r harness/knowledge-mcp/requirements-dev.txt
& ./harness/knowledge-mcp/.venv/Scripts/python.exe -m pytest harness/knowledge-mcp/tests -q
```

Тести використовують тимчасові локальні bare remote, не ваш GitHub/vault. На Windows перевірка symlink може бути пропущена, якщо ОС не дозволяє їх створення. Фактичне підключення через ваш VS Code і публікація на GitHub перевіряються окремо.

## Джерела

- https://py.sdk.modelcontextprotocol.io/v1/
- https://learn.chatgpt.com/docs/extend/mcp
- Вимоги Drive2U: docs/harness-requirements.md, docs/app-requirements.md.
