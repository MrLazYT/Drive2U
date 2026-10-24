# Перевірка skills Drive2U — фактичне продовження

Дата: 2026-10-24. Усі чотири застосування виконані. Гілка `feat/skills-engineering`, предмет рев’ю — робочі файли на HEAD `5884f32ca4c8d2032aad403c7335dd9cc4ef5f14`, без diff цих файлів проти HEAD. Це рев’ю визначених файлів, не всієї гілки. Код, тести, hooks і MCP-конфігурацію не редаговано. Початковий звіт нижче збережений як історія, його статуси «не запущено» більше не є поточними.

## Виявлення, інструкції та дозвіл

Обидва skills наявні в каталозі доступних skills цієї сесії та явно викликані користувачем. Прочитані їхні локальні SKILL.md. Кореневого AGENTS.md і AGENTS.md у D:/, D:/Projects/, D:/Projects/react-native/ не знайдено; `rg --files -g AGENTS.md` і `git ls-files '*AGENTS.md'` не повернули файлів. Прочитані ЗАВДАННЯ.md, docs/app-requirements.md, docs/harness-requirements.md, docs/ontology.md, docs/guardrails.md. Початковий запит дозволяє R1/R2, синхронізацію K1/K2 з публікацією та commit/push звіту в цю гілку; повторне змістовне погодження не вимагалося.

D2U-A001/A002: лише погоджені локальні джерела й MCP для vault. A003: R1 створює власні app/vault/bare remote у тимчасовій папці, transport явно задає ці корені; R2 передає кандидатні команди як JSON і не виконує їх. W001/W002: залежності, auth, ADR не змінювались. W003 задоволено запитом користувача для цих цілей і змісту. B001–B004: без force push, руйнівного git, файлового обходу vault або видалення ADR. Merge у main не виконувався.

## Перевірки та межі R1/R2

R1: harness/knowledge-mcp/knowledge.py, server.py, tests/test_knowledge.py, tests/test_mcp_transport.py; README.md і VERIFICATION.md як пов’язані джерела. Перевірені шляхи/allowlist і symlinks, валідація метаданих, ревізії й повтори, errors без git stderr, writer lock, clean/fetch/fast-forward, pending push, збереження файлів після помилок, per-file atomic_write, STDIO routing. Зовнішні редактори не дотримуються lock; note+MOC не є атомарною парою — це вже задокументовані межі.

R2: harness/guardrails/pre-tool-use.ps1, test_guardrails.py, docs/guardrails-test-cases.md; `.codex/hooks.json` прочитано тестом реєстрації. Перевірені AST detector, JSON routing, deny/passthrough і відмови при помилках. Непокриті shell-обгортки, змінні, aliases, write_stdin та інші інструменти вже задокументовані; це не нові знахідки. Нових знахідок R2 немає.

Зіставлено історичні твердження docs/ontology.md про MCP 1.2.0 і docs/guardrails.md про непідтверджену IDE-активацію з поточним кодом, MCP 1.3.0, Conventions і новішим docs/guardrails-test-cases.md. Останній містить документований D2U-B001 hook-deny та незмінний remote SHA. Нового IDE-тесту або force push у цій задачі не виконували. Unit pass сам по собі не доводить блокування IDE.

### Знахідка R1 — P2: розділення YAML усередині source

Місце: `harness/knowledge-mcp/knowledge.py:30` (`text.split('---', 2)`), повернення результату на рядку 39; source проходить валідацію ingestion, якщо містить `---`. Розділювач не прив’язаний до окремого рядка. Валідний YAML із `source: docs/example---reference.md` читається як `source=docs/example`, а body починається з `reference.md\n---\n\n# Example`. Це відтворено без доступу до vault на синтетичному тексті. Наслідок: некоректне provenance у get_note; подальше збереження повного розібраного тіла може перенести суфікс метаданих у Markdown. Для інших позицій/значень можливе INVALID_YAML; цей варіант окремо не відтворювався.

Відтворення: викликати `parse_note()` для тексту з коректними обов’язковими полями `type: component`, датами, `status: active`, `tags: [drive2u, component]`, зазначеним source, окремими рядками frontmatter `---` і тілом `# Example`. Assert фактичного обрізаного source і body пройшов. Рекомендація: розпізнавати closing delimiter лише як окремий рядок і додати регресійну перевірку значень із `---`. Автоматичного виправлення не виконано.

### Фактичні команди

Усі Python-команди використовували `harness/knowledge-mcp/.venv/Scripts/python.exe`, без встановлення залежностей.

```text
& harness/knowledge-mcp/.venv/Scripts/python.exe -B -c 'import yaml; print(yaml.__version__)'
6.0.3
& harness/knowledge-mcp/.venv/Scripts/python.exe -B C:/Users/swime/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/drive2u-review
Skill is valid!
& harness/knowledge-mcp/.venv/Scripts/python.exe -B C:/Users/swime/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/drive2u-sync-knowledge
Skill is valid!
& harness/knowledge-mcp/.venv/Scripts/python.exe -B -m pytest harness/knowledge-mcp/tests -q -ra -p no:cacheprovider --basetemp .tmp-skills-verification
31 passed, 3 skipped in 80.73s
& harness/knowledge-mcp/.venv/Scripts/python.exe -B -m unittest discover -s harness/guardrails -v
Ran 4 tests in 14.379s — OK
& harness/knowledge-mcp/.venv/Scripts/python.exe -B .tmp-skills-repro.py
REPRODUCED: source truncated; metadata suffix moved into body
git diff --check
exit 0
```

Пропуски R1: OS does not permit symlink creation; POSIX process-group cleanup fixture; POSIX process-group fixture / Windows taskkill needs Windows acceptance. Windows taskkill і symlink захист цим запуском не підтверджені. R2 включає 10 deny/12 passthrough підвипадків, routing, missing command і registration. Предмет R1/R2 після перевірок не має diff проти HEAD.

## MCP-джерела й фактичні застосування

У межах поточного запуску health_check повторно повертав `version=1.3.0`, `write_enabled=true`, `writer_busy=false`, `pending_push=false`, `dirty=null`, `git_status=not_checked_by_health`. Це не свідчення clean tree або свіжого origin; ingestion виконує власні git-перевірки. Після K2 note_count=19 (до нього 18).

Спільні get_note-джерела R1/R2/K1/K2:

| note_id | revision | Значення |
| --- | --- | --- |
| Conventions.md | b76b8bd81aa1b01de2d3ac549dee6cc861891f84092423884a9d114e81d580e1 | Чинні metadata і typed relations; запис не потрібний |
| Components/Knowledge-Connector.md до K1 | 7eee1d13206c9ead4ecebba818527153a4fcd841bf08912e267227a17963d27b | Старий стан 1.2.0, перехід на 1.3.0 підтверджено кодом/health |
| Components/Change-236eea02af6c.md | 6e73cba13d30c45f714f325cc8db3724f12dbb922728f83ab2c8c1d09faed1d4 | Provenance першого MCP-коміту 236eea02af6c70df0240091503c7e02f79a4ba78 |
| Components/Change-c088c2027139.md | 5c5dd8be8b9ce4c8829cd7ce2344dd55194988d00ff4aa6c1b2758a8bf474cc5 | Вимоги, не доказ реалізації; commit c088c202713956dca588ab82adcdf17e06adb986 |

Виконані search_notes(query="Knowledge", limit=20), search_notes(query="Guardrails", limit=20), search_notes(query="Guardrails-Policy", limit=10) та search_notes(query="Backend-API", limit=20). Knowledge повернув Connector, обидві Change-нотатки та MOC; Guardrails — Change-c088c2027139; Guardrails-Policy — total=0 (повторено перед K2). Релевантні знайдені нотатки прочитані get_note.

Backend-API: пошук підтвердив `Components/Backend-API.md`, revision `496beff9611b6b4b53dcd64eb296647dd05031c80f4a4f0c928f87f8684ba174`; get_note повернув `INVALID_YAML`. Це відоме обмеження вхідної нотатки, а не нова знахідка R1 і не підстава файлового обходу. Існуючий навігаційний link у K1 збережено без нових тверджень про Backend-API. Критичними джерелами K1 є прочитані Connector/Conventions та локальний код; відсутній YAML Backend-API не потрібний для підтвердження версії конектора.

| ID | Застосування | Фактичні MCP-виклики / результат |
| --- | --- | --- |
| R1 | drive2u-review | health_check; get_note Conventions/Connector і знайдених Change-нотаток; search_notes Knowledge. Обсяг перевірено; одна доказова P2 вище; код не змінений |
| R2 | drive2u-review | повторний health_check, спільні get_note Conventions/Connector, search_notes Guardrails; get_note Change-c088c2027139. 4 tests OK, нових знахідок немає; IDE-доказ узято з документа |
| K1 | drive2u-sync-knowledge | health_check, get_note Conventions і свіжий Connector, search_notes Knowledge/Backend-API; ingest_note updated; get_note із порівнянням; точний повтор unchanged |
| K2 | drive2u-sync-knowledge | health_check, get_note Conventions/оновленого Connector; search_notes Guardrails-Policy total=0 та get_note NOTE_NOT_FOUND; ingest_note created; get_note із порівнянням; точний повтор unchanged; get_note MOC |

## K1: Knowledge-Connector

Ціль `Components/Knowledge-Connector.md`, type=component, status=active. Збережено попереднє тіло, Related notes, `governed_by: [[Conventions]]` і попередній source. Оновлено підтверджену версію 1.3.0, scoped Conventions update, факт 31/3 тестів, відомі межі health/atomicity, INVALID_YAML і знахідку R1. Conventions уже актуальна — штучного ingestion для неї не було. Нових typed relations, cycles або supersedes немає.

Source містить попередній provenance плюс `drive2u@5884f32ca4c8d2032aad403c7335dd9cc4ef5f14: harness/knowledge-mcp/knowledge.py, server.py, tests; docs/skills-verification.md R1/K1; MCP health_check 1.3.0 2026-10-24`. Повні точні аргументи збережені в [skills-verification-ingest.json](skills-verification-ingest.json).

Перший ingest: status=updated, revision=`7a8dbb9972255daa2645700e399f0a0a71210b6ed99699cd3220990e73236664`, commit=`9d2770248741aa49de0fc48a8791b430a0dcd82c`, published=true. Повторний get_note: те саме тіло (після відділення frontmatter), type/status/source, revision; created і tags збережені. Точний повтор із початковою expected_revision `7eee1d...` і незмінними content/source повернув unchanged, ту саму revision/commit, published=true. K1 завершено.

## K2: Guardrails-Policy

Нова ціль `Components/Guardrails-Policy.md`; відсутність підтверджено двічі search_notes total=0 і get_note NOTE_NOT_FOUND, не виведено з іншої помилки. Type=component, status=active: опис чинного harness-компонента, не ADR. Source: `drive2u@5884f32ca4c8d2032aad403c7335dd9cc4ef5f14: harness/guardrails/pre-tool-use.ps1, test_guardrails.py; docs/guardrails.md; docs/guardrails-test-cases.md; docs/skills-verification.md R2/K2`.

Тіло містить правила A/W/B, контракт AST hook, результат R2 4/4, документований IDE-deny, відомі обходи та розбіжність історичного docs/guardrails.md з новішим доказом. Є лише `governed_by: [[Conventions]]`; Conventions прочитана, Knowledge-Connector як навігаційна ціль підтверджений K1/get_note. Self-links, cycles і supersedes не додано.

Перший ingest без expected_revision: status=created, revision=`ecf208b3376b4925029dbaeac0cfb82408121aae9facd844380470db761531fa`, commit=`69eadcdcdc0abc0f5730f730f1f056083a85e3ad`, published=true. Повторний get_note: тіло, type/status/source і revision збігаються. Точний повтор тих самих аргументів без додавання expected_revision: unchanged, та сама revision/commit, published=true. MOC прочитано: обидві цілі досяжні, revision=`99273dcc37fed67c4f3325e45cc7ceafcb40b8184d72f4da16165bb0927cab2e`. K2 завершено.

## Фактичні втручання, помилки та залишені файли

Користувач явно викликав skills і вказав Python із готовим yaml; ці вказівки застосовано. Сам факт перезапуску застосунку не спостерігався й не приписується людині. Змістовних ручних виправлень skills або коду користувачем у цьому запуску не було. Не було конфліктів revision, busy, disabled writes або published=false; відновлення MCP/мережі людиною не знадобилося.

Два початкові shell-запуски не створили процес через `helper_unknown_error: setup refresh had errors`; подальші команди виконані через механізм ескалації, без зміни sandbox/hooks/config. Перший escalated Get-Content без UTF8 дав mojibake; повторне читання виконано з UTF8. Спроба прочитати відсутній кореневий AGENTS.md дала PathNotFound, після чого відсутність перевірено пошуком. `git status` повідомив про недоступну `.pytest_cache`; cache provider вимкнено, тести використовували окремий basetemp.

Перша синтетична перевірка R1 помилково очікувала exception: фактичним результатом було успішне повернення обрізаних metadata/body та AssertionError самої перевірки. Очікування уточнено до assert фактичного спотворення; повтор exit=0. Це корекція агентом перевірки, не виправлення предмета R1 і не втручання людини. Тимчасовий скрипт не включається до коміту.

Початкові сторонні зміни залишено локально: видалений `harness/knowledge-mcp/README (1).md`, змінений tracked `__pycache__/knowledge.cpython-313.pyc`, `.codex/hook-probe-path.txt`, `hook-probe-a25aeb027fdc4db9a85ac39e70b144fd/`. Нові `.tmp-skills-verification/` і `.tmp-skills-repro.py` також виключені. Commit має містити лише цей звіт та JSON точних ingestion-аргументів. Hooks і MCP-конфігурація не змінені, merge у main не виконувався. P2 залишено для окремого виправлення; Windows taskkill/symlink acceptance не виконана.

## Архів початкової підготовки (до цього продовження)

Дата: 2026-10-24. Гілка: `feat/skills-engineering`, створена від `feat/ontology-guardrails` на `63444ac`. Це проміжний звіт: застосування skills ще не виконані.

## Контекст підготовки

Прочитано ЗАВДАННЯ.md, docs/app-requirements.md, docs/harness-requirements.md, docs/ontology.md та docs/guardrails.md. Через MCP get_note прочитано Conventions.md (revision `b76b8bd81aa1b01de2d3ac549dee6cc861891f84092423884a9d114e81d580e1`) і Components/Knowledge-Connector.md (revision `7eee1d13206c9ead4ecebba818527153a4fcd841bf08912e267227a17963d27b`). Це підготовче читання, а не K1/K2.

Conventions уже містить типізовані зв’язки. Knowledge-Connector усе ще описує 1.2.0 і незавершену наскрізну перевірку. docs/ontology.md та docs/guardrails.md містять історичні твердження про незавершені перевірки; під час реальних застосувань слід звірити їх із кодом і docs/guardrails-test-cases.md, а не переносити некритично. Ці документи в межах підготовки не змінено.

## Структурна валідація

Створено два SKILL.md з frontmatter name/description, входами, межами, процедурою MCP, конкретними ID guardrails, поведінкою при помилках та форматом результату. Зайві скрипти й залежності не додавалися.

Для обох запущено `python -B C:/Users/swime/.codex/skills/.system/skill-creator/scripts/quick_validate.py <skill-folder>`. Обидва запуски завершилися до валідації: `ModuleNotFoundError: No module named 'yaml'`. Успіх офіційного валідатора не заявляється. Спроба базової перевірки через Python -c завершилася SyntaxError через передавання лапок у Windows PowerShell; після цього базову перевірку frontmatter виконано безпосередньо через PowerShell: обидва файли — OK. git diff --check також успішний; ці перевірки не підтверджують поведінку skills.

## Виявлення Codex

Не підтверджено. Доступний агенту каталог цієї сесії не містить drive2u-review і drive2u-sync-knowledge; інструмента перезавантаження/переліку локальних skills немає. Файли створені у репозиторній директорії `.agents/skills`, проте цей факт не зараховується як виявлення або застосування. За пунктом 5 початкової задачі виконання зупинено до підтвердженого виявлення. Інструкція перезапуску та явного виклику — у [skills.md](skills.md#виявлення-і-продовження-перевірки).

## Реальні застосування

| ID | Skill | Задача і потрібні джерела | Фактичні MCP-виклики в застосуванні | Результат і перевірки | Помилки / ручні коригування |
| --- | --- | --- | --- | --- | --- |
| R1 | drive2u-review | knowledge.py, server.py, відповідні тести, вимоги та релевантні MCP-нотатки | Не виконувалися | Не запущено: очікує виявлення skill; знахідки не заявляються | Коригування предмета рев’ю не виконувалися |
| R2 | drive2u-review | pre-tool-use.ps1, test_guardrails.py, guardrails-test-cases.md, релевантні MCP-нотатки | Не виконувалися | Не запущено: очікує виявлення skill; новий тест IDE hook не заявляється | Hook і тести не змінювалися |
| K1 | drive2u-sync-knowledge | Knowledge-Connector, код MCP 1.3.0, health_check, підтвердження Conventions | Не виконувалися; підготовче get_note наведено окремо | Не запущено; ingest_note, published і unchanged для K1 не перевірялися | Vault не змінювався в цій задачі |
| K2 | drive2u-sync-knowledge | Guardrails-Policy, чинний hook, тести й документований IDE hook-deny | Не виконувалися | Не запущено; існування цільової нотатки ще не перевірено | Vault не змінювався в цій задачі |

При продовженні для кожного рядка записати фактичний обсяг/ревізію, джерела, MCP-виклики та відповіді, перевірки, помилки, ручні коригування. Для рев’ю потрібні доказові знахідки або явна їх відсутність. Для синхронізації — note_id, source, revision, commit, published, повторний get_note, точний повтор ingest_note та його результат. Незмінена актуальна нотатка є належним результатом.

## Втручання людини та обмеження

Змістовних ручних коригувань skills або результатів R1–K2 не було; самі застосування не розпочаті. Потрібна дія користувача для перевірки каталогу та продовження після перезапуску; її виконання не припускається. Shell sandbox helper повертає `setup refresh had errors`, тому команди запускалися через механізм ескалації; це не доказ hook-deny. При попередній задачі shell-команда з here-string була відхилена D2U-G001; обхід або вимкнення hook не застосовувалися.

Сторонні зміни README (1).md, knowledge.cpython-313.pyc, .codex/hook-probe-path.txt і hook-probe-папка залишені локально. Hooks і MCP-конфігурація не змінювалися. Merge у main не виконувався. Commit/push підготовлених файлів не означає завершення чотирьох застосувань.
