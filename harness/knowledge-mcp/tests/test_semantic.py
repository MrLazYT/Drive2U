"""Synthetic isolated vaults. Fake embeddings test lifecycle, not retrieval quality."""
import json
from pathlib import Path
import sqlite3
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from knowledge import Vault, KnowledgeError, revision
from semantic import SemanticIndex, chunks


def note(body='# Подорож\n## Ціна\nСервер рахує гроші.', **metadata):
    import yaml
    values = dict(type='concept', created='2026-10-26', updated='2026-10-26',
                  status='planned', tags=['drive2u','concept'], source='synthetic fixture')
    values.update(metadata)
    return '---\n' + yaml.safe_dump(values,allow_unicode=True) + '---\n' + body


class FakeEmbedder:
    identity = 'deterministic-test-only-v1'
    dimension = 3

    def __init__(self):
        self.calls = []

    def fits(self,text):
        return len(text) <= 700

    def encode(self,texts,*,query=False):
        self.calls.append((list(texts),query))
        return [[1.0, float('гроші' in text), float('дороги' in text)] for text in texts]


@pytest.fixture
def index(tmp_path):
    app,root = tmp_path/'app', tmp_path/'vault'
    for path in (app,root):
        path.mkdir(); (path/'.git').mkdir()
    (root/'Concepts').mkdir()
    (root/'Concepts'/'Trip.md').write_text(note(),encoding='utf-8')
    return SemanticIndex(Vault(str(app),str(root)), FakeEmbedder())


def test_chunk_boundaries_metadata_and_stable_ids():
    text=note('# Подорож\n## Розділ\n' + 'довгий текст ' * 500 + '\n```md\n# не заголовок\n```')
    found=chunks('Concepts/Trip.md',text,lambda t:len(t)<=700)
    assert len(found)>5 and all(len(c['embedding_text'])<=700 for c in found)
    assert all(c['revision']==revision(text) and c['source']=='synthetic fixture' for c in found)
    assert len({c['chunk_id'] for c in found})==len(found)
    assert all('не заголовок' not in c['section'] for c in found)
    assert [c['chunk_id'] for c in found]==[c['chunk_id'] for c in chunks('Concepts/Trip.md',text,lambda t:len(t)<=700)]
    assert 'довгий текст' in '\n'.join(c['text'] for c in found)


def test_persistence_incremental_add_change_delete(index):
    first=index.search('гроші',5)
    assert first['mode']=='semantic' and first['index_updates']=={'changed':1,'removed':0}
    assert {'excerpt','note_id','revision','name_match','text','section','score','source','chunk_id'} <= first['results'][0].keys()
    assert all('passage' not in t for texts,q in index.embedder.calls for t in texts)
    second=SemanticIndex(index.vault,index.embedder).search('гроші',5)
    assert second['index_updates']=={'changed':0,'removed':0}
    assert sum(not q for _,q in index.embedder.calls)==1
    root=index.vault.root
    (root/'Concepts'/'Other.md').write_text(note('# Інше\nдороги'),encoding='utf-8')
    assert index.search('дороги',5)['index_updates']['changed']==1
    (root/'Concepts'/'Trip.md').write_text(note('# Подорож\nНове тіло'),encoding='utf-8')
    changed=index.search('гроші',5)
    assert changed['index_updates']['changed']==1
    assert all('Сервер рахує' not in r['text'] for r in changed['results'])
    (root/'Concepts'/'Trip.md').unlink()
    deleted=index.search('гроші',5)
    assert deleted['index_updates']['removed']==1
    assert all(r['note_id']!='Concepts/Trip.md' for r in deleted['results'])


def test_invalid_metadata_is_explicit(index):
    (index.vault.root/'Concepts'/'Bad.md').write_text(note(tags='secret'),encoding='utf-8')
    with pytest.raises(KnowledgeError,match='INVALID_INDEX_METADATA'):
        index.search('x',1)


def test_missing_metadata_is_not_silently_skipped(index):
    (index.vault.root/'Concepts'/'Bad.md').write_text('no frontmatter',encoding='utf-8')
    with pytest.raises(KnowledgeError,match='INVALID_FRONTMATTER'):
        index.search('x',1)


def test_empty_corpus(index):
    (index.vault.root/'Concepts'/'Trip.md').unlink()
    found=index.search('x',1)
    assert found['results']==[] and found['total']==0


@pytest.mark.parametrize('damage',['file','row','missing','vector','model'])
def test_corrupt_incomplete_incompatible_index(index,damage):
    index.search('x',5)
    path=index.directory/'vectors.sqlite3'
    if damage=='file':
        path.write_bytes(b'not a sqlite database')
    else:
        with sqlite3.connect(path) as db:
            if damage=='row': db.execute("UPDATE vectors SET document='{}'")
            if damage=='missing': db.execute('DELETE FROM vectors')
            if damage=='vector': db.execute("UPDATE vectors SET vector='[NaN,0,1]'")
            if damage=='model': db.execute("UPDATE state SET value='different' WHERE key='fingerprint'")
    with pytest.raises(KnowledgeError,match='SEMANTIC_INDEX_(CORRUPT|INCOMPLETE|INCOMPATIBLE)'):
        index.search('x',5)


def test_allowlist_and_traversal(index):
    root=index.vault.root
    (root/'Secrets').mkdir(); (root/'Secrets'/'Token.md').write_text('secret')
    (root/'Concepts'/'nested').mkdir(); (root/'Concepts'/'nested'/'No.md').write_text('secret')
    assert set(index.search('x',50)['note_revisions'])=={'Concepts/Trip.md'}
    for bad in ('../secret.md','.git/config','Concepts/a/b.md','Concepts\\Trip.md'):
        with pytest.raises(KnowledgeError): index.vault.get(bad)


def test_symlink_note_excluded(index,tmp_path):
    target=tmp_path/'outside.md';target.write_text('secret')
    link=index.vault.root/'Concepts'/'Link.md'
    try: link.symlink_to(target)
    except OSError: pytest.skip('Windows symlink privilege unavailable')
    assert 'Concepts/Link.md' not in index.search('x',5)['note_revisions']


def test_junction_check_is_used(index,monkeypatch):
    actual=getattr(Path,'is_junction',lambda self:False)
    monkeypatch.setattr(Path,'is_junction',lambda p:p.name=='Concepts' or actual(p),raising=False)
    with pytest.raises(KnowledgeError,match='SYMLINK_NOT_ALLOWED'):
        index.vault.read('Concepts/Trip.md')
    assert index.search('x',5)['results']==[]


@pytest.mark.parametrize('query,limit',[('',5),('   ',5),('x',0),('x',51),('x',True),('x'*201,5)])
def test_input_contract(index,query,limit):
    index.vault._semantic_index=index
    with pytest.raises(KnowledgeError,match='INVALID_SEARCH'):index.vault.search(query,limit)


def test_health_never_loads_embedder(index,monkeypatch):
    monkeypatch.setattr(index.embedder,'fits',lambda _:pytest.fail('health loaded model'))
    index.vault._semantic_index=index
    assert index.vault.health()['ok']


def test_corpus_changes_during_embedding_are_not_returned(index):
    actual=index.embedder.encode
    def change(texts,*,query=False):
        if query:
            (index.vault.root/'Concepts'/'Trip.md').write_text(note('# Changed'),encoding='utf-8')
        return actual(texts,query=query)
    index.embedder.encode=change
    with pytest.raises(KnowledgeError,match='CORPUS_CHANGED_DURING_SEARCH'):index.search('x',5)


def test_model_unavailable_no_fallback(index):
    from semantic import E5Embedder
    index.embedder=E5Embedder(index.vault.app)
    with pytest.raises(KnowledgeError,match='SEMANTIC_MODEL_UNAVAILABLE'):index.search('x',5)


def test_index_directory_reparse_rejected(index,monkeypatch):
    actual=getattr(Path,'is_junction',lambda self:False)
    monkeypatch.setattr(Path,'is_junction',lambda p:p.name=='.knowledge-index' or actual(p),raising=False)
    with pytest.raises(KnowledgeError,match='INDEX_PATH_UNSAFE'):index.search('x',5)
