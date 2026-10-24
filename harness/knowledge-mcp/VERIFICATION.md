# Перевірка 1.3.1 — 2026-10-24

Перед виправленням: regression quoted source з `---` — **1 failed**,
KnowledgeError INVALID_YAML із початкового parse_note. Після виправлення:
**42 passed, 3 skipped in 81.68s**, Windows/Python 3.13, одноразові локальні
app/vault/bare remote. Окрема parser-група — 11 passed. Команда:

```powershell
& harness/knowledge-mcp/.venv/Scripts/python.exe -B -m pytest harness/knowledge-mcp/tests -q -ra -p no:cacheprovider --basetemp .tmp-yaml-full --tb=short
```

Підтверджено окремі рядки fences, source/body з `---`, LF/CRLF/BOM,
block scalar, явні missing/malformed errors, незмінні paths/revisions/locks/git
регресії та новий transport-процес health=1.3.1. Три пропуски: symlink без
Windows-дозволу й два POSIX process-group cases. drive2u-review застосовано,
нових знахідок немає; це не незалежний окремий агент.

**Активний MCP усе ще 1.3.0**, а не 1.3.1. До перезапуску Conventions і
Knowledge-Connector читаються, Backend-API/Fare-Quote/Route — INVALID_YAML.
MCP-search показав NBSP U+00A0 у tags-відступах цих трьох нотаток;
синтетичний аналог навмисно лишається INVALID_YAML у новому парсері.
Не заявляється усунення всіх реальних YAML-помилок. Післяперезапускові
читання та sync Backend-API ще не виконані; ingest не було.
Повні докази, revisions, межі review та інструкція продовження:
[knowledge-yaml-fix.md](../../docs/knowledge-yaml-fix.md).

Нижче збережені попередні результати без переписування історії.

# Перевірка 1.3.0 — 2026-10-24

Windows/Python 3.13, одноразові локальні app/vault/bare remote.
Команда PowerShell (новий унікальний temp замість недоступного стандартного
каталогу pytest, де перший запуск отримав WinError 5 до виконання тестів):

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$testTemp = Join-Path $env:TEMP ('knowledge-conventions-' + [guid]::NewGuid().ToString('N'))
& ./harness/knowledge-mcp/.venv/Scripts/python.exe -B -m pytest harness/knowledge-mcp/tests -q -p no:cacheprovider --basetemp $testTemp --tb=short
```

Фактично: **31 passed, 3 skipped in 87.73s**. Пропущені Windows symlink
без дозволу ОС і два POSIX-тести керування процесами.

Перевірено оновлення наявного кореневого Conventions.md з актуальною ревізією,
збереження метаданих і попереднього тексту, commit/push до локального remote,
відхилення застарілої ревізії без зміни файла/HEAD, повтор зі старою ревізією
без нового коміту. Інші кореневі назви, довільний тип, зміна регістру назви
і шляхи замість title відхилені. Перевірено writer lock та режим лише читання.
Ці операції Conventions також перевірено через справжній MCP/STDIO.
Наявні регресійні тести шляхів, fast-forward, ідемпотентності та відновлення
після помилки commit/push пройшли.

Стан реального vault: **очікує перезапуску MCP**. До нього Conventions.md
не оновлювали. Після перезапуску перевірити health_check version=1.3.0,
прочитати Conventions.md через get_note, зберегти його зміст і доповнити
правилами типізованих зв'язків із docs/ontology.md через ingest_note
з актуальною expected_revision. Перевірити published=true та повтор unchanged.

# Перевірка 1.2.0 — 2026-10-23

24 passed, Linux/Python 3.12. Додані два регресійні тести:
успадкований stdout дочірнього процесу не затримує успішний виклик;
тайм-аут git завершує POSIX-групу процесів і повертає GIT_TIMEOUT:fetch.
Windows taskkill не перевірений цими POSIX-тестами. Реальний GitHub fetch/push
через Codex підтверджено окремим прийманням нижче.

# Перевірка 1.1.0 — 2026-10-23

22 passed на Linux/Python 3.12, включно з реальним MCP/STDIO.
Додаткові регресійні перевірки: health/get/search працюють при зайнятому writer lock;
health/get/search не викликають git. Приймання Windows/Codex для версії 1.2.0
зафіксовано нижче. Протокол у Windows уже підтверджений користувачем;
попередня реалізація health повертала VAULT_BUSY.

# Перевірка Knowledge MCP

## Виконано 2026-10-22

Середовище: Linux, Python 3.12, mcp 1.30.0. Команда:

```text
python -m pytest harness/knowledge-mcp/tests -q
20 passed
```

Перевірено: створення, читання, текстовий пошук, повтор без нового коміту, оновлення з SHA256 revision, конфлікт версії; валідація шляхів і симлінків; режим лише читання; незакомічені зміни; відсутні wiki-цілі; дублі назв; fast-forward від remote; заборона публікації сторонніх локальних комітів; невдалий push і повтор; збереження файлів при помилці commit; ignored paths; відокремлені корені репозиторіїв.

Транспортний тест реально запускав server.py як STDIO-процес через MCP Python ClientSession, виконував initialize/list_tools/health_check, три ingestion зі штучними подіями, повтори, retrieval і заборонений шлях. Зміни опубліковані в одноразовий локальний bare git remote. Це протокольна інтеграційна перевірка, не демонстрація викликів вашим Codex у VS Code й не публікація у ваш GitHub.

## Приймання через Codex — 2026-10-24

Локально на Windows/Python 3.13 виконано:
`harness/knowledge-mcp/.venv/Scripts/python.exe -m pytest harness/knowledge-mcp/tests -q`.
Результат: **21 passed, 3 skipped** за 61.96 с. Два POSIX-тести
керування процесами та перевірка symlink пропущені на Windows;
це не підтверджує роботу Windows taskkill при тайм-ауті.

Версія конектора: **1.2.0**. Через Codex перевірені `health_check`, `get_note`,
`search_notes`, `ingest_note`, а також commit і push, які виконує knowledge MCP.
GitHub MCP працює в режимі лише читання; запис до vault виконувався тільки
через `drive2u_knowledge.ingest_note` за явним дозволом користувача.

| Перевірка | Фактичний результат / commit |
|---|---|
| Codex бачить drive2u_knowledge та чотири інструменти | Підтверджені health_check, get_note, search_notes, ingest_note |
| Читання через get_note | Прочитані Conventions.md, обидві Change-нотатки та MOC-Drive2U.md |
| ingest_note для першої реальної зміни | Components/Change-236eea02af6c.md: created, published=true |
| ingest_note для другої реальної зміни | Components/Change-c088c2027139.md: created, published=true |
| ingest_note для третьої реальної зміни | Не входить у цей ланцюжок із двох комітів |
| Повтор запитів із точно тими самими аргументами | Обидва unchanged, published=true; додаткових комітів немає |
| Публікація нотаток та оновлення MOC | Обидва push підтверджені published=true; посилання MOC прочитані через get_note |
| GitHub MCP читає реальні зміни | list_commits і get_commit: обидва коміти MrLazYT/Drive2U, повні diff і списки файлів |

### Ланцюжок GitHub MCP → knowledge MCP

Через `drive2u_github.list_commits` отримано обидва коміти, через
`drive2u_github.get_commit` — їхні деталі з `detail=full_patch`, `perPage=100`.
Списки з 13 та 3 файлів повністю вмістилися на перших сторінках;
додаткові сторінки не потрібні. Через `drive2u_knowledge.get_note` прочитано
Conventions.md, через `search_notes` перевірено пов’язані нотатки.

| Коміт Drive2U | Повідомлення / дата UTC | Нотатка | Коміт vault |
|---|---|---|---|
| 236eea02af6c70df0240091503c7e02f79a4ba78 | added knowledge_mcp / 2026-10-23T13:42:04Z | Components/Change-236eea02af6c.md | 88e5c8a2bc28c29ea27e904df3471066740f25ee |
| c088c202713956dca588ab82adcdf17e06adb986 | init / 2026-10-22T14:37:20Z | Components/Change-c088c2027139.md | ac6c41cc086f4bb19b164947ee82aa471cbe686f |

Для кожної нотатки `ingest_note` повернув `created`, `published=true`.
Після створення обох повторено кожен виклик із точно тими самими аргументами:
обидва повернули `unchanged`, `published=true`, поточний HEAD
`ac6c41cc086f4bb19b164947ee82aa471cbe686f`. Перший коміт vault відрізняється
від цього HEAD, бо між створенням першої нотатки та повторами створено другу;
самі повтори нових комітів не створили.

Обидві нотатки прочитані через `get_note`: підтверджено повні SHA джерел,
type=component, status=active, URL комітів у source та посилання на
Knowledge-Connector і Conventions. MOC містить обидві Change-нотатки.
Це перевірка інтеграції та публікації; тести коду застосунку під час цього
ланцюжка не запускалися.
