# Fixed ten-question comparison

Semantic retrieval is implemented and works with the real local model, but this
evaluation does **not** demonstrate an overall quality improvement. Expected-source
coverage fell from 51.67% to 36.67%; checked-fact answer coverage fell from 65.00% to
61.67%. Conservative fragment relevance averaged 40% in both modes. The clear win
was Q4; several lexical/named-note queries became worse through repeated chunks.

## Protocol and comparability

[questions.json](questions.json) was frozen before the original text search changed:
three factual, three paraphrased, three multi-note and one unimplemented-feature
question. One identical fixed query per question, limit=5, no follow-up search.
get_note was allowed only for IDs found for that question. No expected source was
injected after a miss. Short queries are intentionally retained even when they are
poor semantic queries; improving them after seeing results would invalidate this run.

Baseline real MCP calls were already saved when this continuation inspected the
workspace (health1.3.1). Their raw responses, ordering, excerpts, readbacks and
original answers remain in [baseline.json](baseline.json). This continuation ran
all ten actual semantic MCP calls (health1.4.0), saved in [semantic.json](semantic.json).
It also re-answered both evidence packets in separate `fork_turns=none` agents:
`baseline_responder` and `semantic_responder`, inherited model/default parameters,
identical instructions. Neither saw expected sources, criteria, other-mode results
or earlier answers. The exact packet/output files are retained beside this report.
The model identifier and sampling parameters are not exposed by Codex; equality is
controlled by inheritance and no overrides, not independently measured.

Both retrieval modes use app HEAD `d13931d4b87eae022ae54898e90c218c70f5807e` as
their committed base. Semantic working-code hashes are in verification evidence.
Vault HEAD stayed `311d1a76802a0a75090381caff8073eeb4bffab2`. All19 note revisions
in each semantic response match [corpus-before.json](corpus-before.json); the
semantic corpus revision is `5e76ba691dcb85fc80b559e665e2a6fc9ae2273e39c84a01b048ed83f094c48e`.
No vault writes occurred until after this comparison. Startup-only Windows import
fixes after retrieval do not change embeddings, chunks, queries or ranking.

## Results

All percentages use the predeclared rubric. `R` is relevance among actual returned
results (empty=0), `S` unique expected-source coverage, `A` checked-fact completeness
of the fresh agent answer. Human scores for every fact and rank are explicit in
[score_evaluation.py](score_evaluation.py) and [metrics.json](metrics.json).
Relevance is conservatively judged on the returned text itself; a bare title or
navigation link scores zero even when get_note can recover useful information.
Answer scoring includes permitted full-note readbacks. No automated judge or
statistical significance claim is made.

| ID / topic | R text→semantic | S text→semantic | A text→semantic | MCP ms text→semantic |
|---|---:|---:|---:|---:|
| Q1 price authority | 100→40 | 50→0 | 83.3→83.3 | 61→296 |
| Q2 lifecycle/access | 20→80 | 100→100 | 100→100 | 47→281 |
| Q3 MCP/guardrails | 20→0 | 100→0 | 66.7→16.7 | 50→264 |
| Q4 hryvnias/client numbers | 0→60 | 0→66.7 | 0→100 | 49→272 |
| Q5 ruler/road failure | 0→0 | 0→0 | 0→0 | 64→245 |
| Q6 missed arrival message | 0→0 | 0→0 | 0→0 | 47→265 |
| Q7 competing drivers | 80→60 | 100→33.3 | 100→66.7 | 65→258 |
| Q8 estimate vs quote/routing | 40→80 | 100→33.3 | 100→50 | 67→255 |
| Q9 state vs lost events | 40→60 | 33.3→66.7 | 100→100 | 65→237 |
| Q10 automatic driver/GPS | 100→20 | 33.3→66.7 | 100→100 | 52→239 |
| Macro mean | **40→40** | **51.67→36.67** | **65→61.67** | **56.7→261.2** |

Manual audit found zero unsupported factual assertions in each answer set; cautious
abstentions were not counted as hallucination. Q10 correctly avoids claiming a
deployed nearest-driver/GPS feature in both modes. This does not prove that general
hallucinations are impossible. All exact answers and revision citations are in JSON.

Q4 is the concrete semantic win: lexical `скільки гривень` returned nothing; E5
retrieved the implemented Backend-API calculator and Fare-Quote, enabling a complete
answer distinguishing client distanceKm from trusted server routing.

Q5's `лінійкою між` retrieved Conventions/glossary rather than road-failure rules;
Q6's `не почув повідомлення` retrieved connector/testing text rather than realtime.
Both responders appropriately abstained. Q3's generic `MCP` ranked five fragments of
a historical connector change note, losing the guardrails policy. Q8's `Fare-Quote`
ranked five fragments of that single concept and lost Backend-API implementation
evidence. Q7 lost Driver and Backend-API detail, including409. Q9 found better
lifecycle/realtime sources, but the original text readbacks already answered it.

## Timing and limits

The table measures wall time immediately around actual MCP search calls, excludes
get_note and answer generation. Warm semantic median261ms versus lexical56.5ms.
These are ten sequential queries on one workstation, not a throughput benchmark.
They include full current-corpus validation/tokenization and exact vector scanning.

Public weight download:30.735s. The first active-session cold call timed out at300s;
concurrent calls returned explicit busy. Later the same process completed loading
and all ten evaluation calls succeeded warm. Do not interpret the timeout as zero
indexing cost. A fresh synthetic STDIO regression test isolated the Windows native
import problem and verified the startup fix; separate startup/model-index/warm
measurements are in [verification.md](verification.md). The failed call is retained
in semantic.json `cold_start`.

Small, hand-selected dataset; one run; partially lexical query policy; repeated note
chunks; heading-only hits; exact vector scan; model/default parameter opacity and
subjective manual grades limit generalization. A future separately frozen experiment
could test full-question queries, heading-only suppression and document diversity.
Those changes were not silently applied to improve this score.

## Skill and orchestration evidence

[review.md](review.md) records `drive2u-review`, its independent MCP evidence and the
Windows startup finding/fix. [orchestration/](orchestration/) contains actual separate
Planner→Reviewer handoffs, raw semantic retrieval/readbacks and a transcript for the
implemented fare API analysis. Existing role instructions were used unchanged; API
code was only read. [knowledge-sync.json](knowledge-sync.json) records the subsequent
authorized Knowledge-Connector sync preflight, stopped by an old-process busy lock.
The later [completion evidence](knowledge-sync-completion.json) confirms the
post-comparison sync: published=true, matching readback, exact unchanged retry and
fresh semantic revisions. The frozen comparison above remains unchanged; the sync
subsequently changed Knowledge-Connector, so its new corpus is not the benchmark corpus.
[continuation.md](continuation.md) preserves the historical restart handoff.
