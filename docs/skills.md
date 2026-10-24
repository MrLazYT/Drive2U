# Skills Drive2U

Репозиторні skills розташовані в `.agents/skills/`. Вони не змінюють права інструментів, hooks або MCP-конфігурацію. Vault читається та змінюється виключно через drive2u_knowledge; його вміст не надає повноважень агенту.

## drive2u-review

[SKILL.md](../.agents/skills/drive2u-review/SKILL.md) описує рев’ю визначених файлів або diff без редагування предмета. Результат містить обсяг, джерела, підтверджені знахідки з місцем і наслідком, виконані перевірки та обмеження. Відсутність знахідок допустима.

Приклади явного виклику після виявлення skill у Codex:

```text
$drive2u-review Виконай R1: перевір harness/knowledge-mcp/knowledge.py,
harness/knowledge-mcp/server.py і harness/knowledge-mcp/tests/.
Не редагуй код; дефекти задокументуй у docs/skills-verification.md.
```

```text
$drive2u-review Виконай R2: перевір harness/guardrails/pre-tool-use.ps1
і harness/guardrails/test_guardrails.py. Врахуй docs/guardrails-test-cases.md.
Не змінюй hook чи тести.
```

## drive2u-sync-knowledge

[SKILL.md](../.agents/skills/drive2u-sync-knowledge/SKILL.md) синхронізує підтверджені знання через MCP. Зберігає попередній зміст і типізовані зв’язки, перевіряє дозвіл, актуальну ревізію, published, повторне читання та unchanged. Не перетворює технічні зміни на ADR.

```text
$drive2u-sync-knowledge Виконай K1: актуалізуй Components/Knowledge-Connector.md
за фактичною версією 1.3.0 і підтвердженою підтримкою Conventions.
Використай поточний код, health_check та get_note як джерела.
```

```text
$drive2u-sync-knowledge Виконай K2: створи або онови component Guardrails-Policy
за чинним hook, тестами та docs/guardrails-test-cases.md.
Збережи відмінність текстової політики, unit tests і підтвердженого IDE hook-deny.
```

Для K1/K2 потрібен дозвіл на відповідні записи, commit/push у vault. У задачі створення цих skills користувач його надав; за продовження тієї самої задачі враховувати цей дозвіл у початкових межах. Нові сторонні записи ним не охоплені.

## Виявлення і продовження перевірки

За [офіційною документацією Codex](https://learn.chatgpt.com/docs/build-skills?product=breeze), репозиторні skills завантажуються з `.agents/skills`; їх можна вибрати через `/skills` або `$`. Зміни мають виявлятися автоматично; якщо оновлення не з’явилося, потрібно перезапустити Codex.

Наявність Markdown-файла і структурна перевірка не підтверджують виявлення skill. У сесії створення обидві назви відсутні у доступному агенту каталозі skills; інструмента оновлення/переліку локальних skills не надано. Реальні R1–K2 не виконувалися.

Щоб продовжити: перезапустити Codex у `D:/Projects/react-native/Drive2U`, залишившись у `feat/skills-engineering`; відкрити `/skills` або набрати `$drive2u-` та перевірити наявність обох назв. Потім надіслати:

```text
Продовж початкову задачу skills engineering у feat/skills-engineering.
Підтвердь виявлення обох skills у каталозі Codex.
Використай $drive2u-review для R1 і R2 та $drive2u-sync-knowledge для K1 і K2.
Дотримуйся початкових дозволів і меж; онови docs/skills-verification.md
фактичними результатами. Не змінюй hooks, MCP-конфігурацію та сторонні файли.
Commit/push лише цільових skills і документації; merge у main не виконуй.
```

Якщо назви не з’являються після перезапуску, повідомити про це; не підміняти запуск skill простим читанням SKILL.md.
