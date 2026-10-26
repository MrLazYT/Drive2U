# Finish knowledge sync after replacing old MCP processes

Implementation/evaluation commit: `be24e88ef05239f5be6d07959184a5d28d40b6a9`.
Working branch: `feat/semantic-retrieval`; no merge into main. Do not reset unrelated
deleted README copy, tracked bytecode, temp or hook-probe files.

The comparison is complete. All19 revisions were checked again through MCP and
remain identical to the frozen corpus (`corpus-after.json`). No ingestion occurred.
The final skill sync is incomplete: `search_notes("Knowledge-Connector",10)` returned
SEMANTIC_INDEX_BUSY although writer_busy=false. A pre-fix review process began a
native ML import after STDIO reader startup; terminating its orchestration waiter
did not confirm backend cancellation. The derived index lock was still held.
No lock was removed and no backend/writer was killed. See knowledge-sync.json.

The code startup fix passes a fresh real STDIO test. Existing active MCP processes
have imported old modules and are not updated by editing Python. Replace all of
this Codex CLI session's child MCP processes by a clean application restart:

1. Let remaining tool calls finish; do not start another semantic query in the old
   session. Save the branch/evidence (committed in this task).
2. Exit Codex CLI cleanly using `/exit` or its normal interactive exit. Close other
   Codex sessions from this task so their old knowledge MCP children also exit.
3. Open a fresh terminal in `D:/Projects/react-native/Drive2U`, run `codex`. Keep
   existing config.toml, hooks and GitHub MCP configuration. Do not remove lock files.
4. Send the following prompt. No new write approval is needed within the original
   user authorization; the intervention is process restart, not additional scope.

```text
Заверши початкову задачу semantic retrieval у feat/semantic-retrieval за
docs/retrieval/continuation.md. Прочитай verification.md, knowledge-sync.json,
comparison.md та застосовні інструкції; не скидай сторонні зміни.
Через drive2u_knowledge перевір health_check1.4.0 і справжній semantic search.
Прочитай Conventions.md. Перевір усі frozen revisions з corpus-after.json через MCP;
до синхронізації корпус має лишитися тим самим. Не повторюй benchmark за незмінного
корпусу; якщо змінився, прямо познач порівняння непорівнюваним або повтори з тими
самими питаннями, limit, fresh responder instructions/model defaults і без еталонів.
Застосуй $drive2u-sync-knowledge до Components/Knowledge-Connector.md за кодом
be24e88ef05239f5be6d07959184a5d28d40b6a9. Знайди ціль через search_notes та одразу
прочитай get_note; збережи повний попередній зміст, provenance і Typed relations.
Онови опис search_notes з текстового на локальний E5-small pinned revision + SQLite,
1000char/512token heading chunks, provenance/revisions, freshness і явні errors.
Уточни історичний INVALID_YAML: виправлення1.3.1 та відновлення Backend-API вже
підтверджені d13931d/реальними MCP readbacks, це більше не чинна помилка.
Додай фактичний1.4.0,64passed5skipped,окремий real STDIO1passed22.62s,
Windows dependency preload/startup cost, змішане benchmark65→61.67%/51.67→36.67%,
без неправдивої заяви загальної переваги semantic. Не називай Fare-Quote готовим.
Використай свіжу expected_revision, збережи точні args. Перевір published=true,
get_note body/metadata/revision і точний повтор ingest_note з ТИМИ САМИМИ args,
включно з оригінальним expected_revision, повинен бути unchanged без нового commit.
Після цього search_notes має інкрементально оновити індекс; звір актуальні revisions
Knowledge-Connector та MOC (якщо він змінений), повторний search0changed/0removed.
Збережи всі реальні виклики/результати у knowledge-sync.json та verification.md,
прибери лише pending-формулювання comparison/continuation за доказами.
Перед commit перевір staged diff/секрети, commit і звичайний push тільки цільових
доказів у feat/semantic-retrieval. Ні mergemain, ні API/mobile/config/hooks/vaultFS.
```

This is not a claim that sync is ready. Completion requires published=true, matching
readback, exact unchanged retry and a refreshed index; all are currently unverified.
