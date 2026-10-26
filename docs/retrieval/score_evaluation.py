"""Recompute metrics from immutable MCP evidence and explicit human judgments.

Never opens a vault, calls a model, changes questions, or fabricates tool results.
"""
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parent
def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8-sig'))
def payload(raw):
    return raw.get('structuredContent') or json.loads(raw['content'][0]['text'])

# Rank relevance is judged on returned fragments, not unseen/full-note content.
# 1 means the fragment supports a checked fact, 0 means navigation/off-topic only.
REL = {
    'baseline': [[1,1],[0,1,0,0,0],[0,0,1,0,0],[],[],[],[1,0,1,1,1],
                 [0,1,1,0,0],[1,0,0,0,1],[1]],
    'semantic': [[0,0,0,1,1],[0,1,1,1,1],[0,0,0,0,0],[1,1,0,1,0],
                 [0,0,0,0,0],[0,0,0,0,0],[1,0,1,1,0],[1,0,1,1,1],
                 [1,1,1,0,0],[0,0,0,0,1]],
}
# Frozen checked_facts in their original order: absent=0, partial=.5, explicit=1.
FACTS = {
    'baseline': [[1,1,.5],[1,1,1],[1,0,1],[0,0,0],[0,0,0],[0,0,0],
                 [1,1,1],[1,1,1],[1,1,1],[1,1,1]],
    'semantic': [[1,1,.5],[1,1,1],[0,.5,0],[1,1,1],[0,0,0],[0,0,0],
                 [.5,.5,1],[0,.5,1],[1,1,1],[1,1,1]],
}
questions = read('questions.json')['questions']
baseline_corpus = {r['note_id']:r['revision'] for r in read('corpus-before.json')['results']}
report = {'assessment':'human rubric judgments; no automated truth classifier', 'modes':{}}
for mode in ('baseline','semantic'):
    evidence = read(mode+'.json')
    answers = read(mode+'-responder-output.json')
    rows = []
    for i,(q,raw,answer) in enumerate(zip(questions,evidence['questions'],answers)):
        assert q['id']==raw['id']==answer['id']
        assert q['query']==raw['query'] and raw['search']['args']['limit']==q['limit']
        data = payload(raw['search']['raw_response'])
        results = data['results']
        assert len(REL[mode][i])==len(results)
        assert all(r['revision']==baseline_corpus[r['note_id']] for r in results)
        if mode=='semantic':
            assert data['note_revisions']==baseline_corpus, 'corpus changed: comparison invalid'
        ids = {r['note_id'] for r in results}
        assert all(c['note_id'] in ids for c in answer['cited_notes'])
        row = dict(id=q['id'], relevance_by_rank=REL[mode][i],
            precision_at_5=sum(REL[mode][i])/len(results) if results else 0,
            expected_source_coverage=len(ids & set(q['expected_sources']))/len(q['expected_sources']),
            checked_fact_scores=FACTS[mode][i], answer_score=statistics.mean(FACTS[mode][i]),
            unsupported_assertions=0, elapsed_wall_ms=raw['search']['elapsed_wall_ms'])
        rows.append(row)
        raw.setdefault('original_answer_before_fresh_responder', raw.get('actual_agent_answer'))
        raw.update({k:answer[k] for k in ('actual_agent_answer','cited_notes','abstention')})
        raw['assessment'] = row
    report['modes'][mode] = dict(questions=rows,
        mean_precision=statistics.mean(r['precision_at_5'] for r in rows),
        mean_source_coverage=statistics.mean(r['expected_source_coverage'] for r in rows),
        mean_answer_score=statistics.mean(r['answer_score'] for r in rows),
        unsupported_assertions=0,
        mean_search_ms=statistics.mean(r['elapsed_wall_ms'] for r in rows),
        median_search_ms=statistics.median(r['elapsed_wall_ms'] for r in rows))
    # Preserve raw search/readbacks and the initially recorded answers as evidence.
    evidence['responder_context'] = mode+'_responder; fork_turns=none; inherited model/default parameters'
    (ROOT/(mode+'.json')).write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'metrics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:{a:b for a,b in v.items() if a!='questions'} for k,v in report['modes'].items()},indent=2))
