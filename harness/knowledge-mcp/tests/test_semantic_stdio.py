"""Opt-in real multilingual model over STDIO; only a synthetic temporary vault."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import sys
import time

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from semantic import MODEL_REVISION


@pytest.mark.skipif(os.environ.get('KNOWLEDGE_REAL_MODEL_TEST') != '1',
                    reason='opt-in real model smoke; no automatic downloads')
def test_real_multilingual_stdio(tmp_path):
    from test_semantic import note
    source = Path(__file__).resolve().parents[3] / '.knowledge-models' / MODEL_REVISION
    assert (source / 'model.safetensors').is_file(), 'run prepare_model.py first'
    app, root = tmp_path / 'app', tmp_path / 'vault'
    for path in (app, root):
        (path / '.git').mkdir(parents=True)
    # Copy public model assets once; no symlinks or access to the working vault.
    shutil.copytree(source, app / '.knowledge-models' / MODEL_REVISION,
                    ignore=shutil.ignore_patterns('.cache'))
    (root / 'Concepts').mkdir()
    (root / 'Concepts' / 'Reconnect.md').write_text(note(
        '# Відновлення з’єднання\n## Після розриву\n'
        'Після перепідключення клієнт перечитує актуальний стан через API. '
        'Пропущені події компенсуються читанням, старі версії відкидаються.'), encoding='utf-8')
    (root / 'Concepts' / 'Payment.md').write_text(note(
        '# Оплата\n## Вартість\nСервер рахує ціну в гривнях за тарифом.'), encoding='utf-8')

    async def run():
        params = StdioServerParameters(command=sys.executable,
            args=['-B', str(Path(__file__).resolve().parents[1] / 'server.py')],
            env={**os.environ, 'DRIVE2U_APP_ROOT':str(app), 'DRIVE2U_VAULT_ROOT':str(root),
                 'KNOWLEDGE_RETRIEVAL_MODE':'semantic', 'KNOWLEDGE_ALLOW_WRITE':'0',
                 'HF_HUB_OFFLINE':'1', 'HF_HUB_DISABLE_TELEMETRY':'1'})
        start = time.perf_counter()
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                startup_ms = (time.perf_counter() - start) * 1000
                def data(r):
                    assert not r.isError, r.content
                    return r.structuredContent or json.loads(r.content[0].text)
                assert data(await session.call_tool('health_check', {}))['version'] == '1.4.0'
                assert not (app / '.knowledge-index').exists()
                args = {'query':'How to recover missed events after reconnecting?', 'limit':3}
                first = data(await session.call_tool('search_notes', args))
                assert first['mode'] == 'semantic'
                assert first['results'][0]['note_id'] == 'Concepts/Reconnect.md'
                assert first['results'][0]['score_kind'] == 'cosine_similarity'
                second = data(await session.call_tool('search_notes', args))
                assert second['index_updates'] == {'changed':0, 'removed':0}
                assert first['corpus_revision'] == second['corpus_revision']
                print(json.dumps({'startup_ms':round(startup_ms,3),
                    'first_search_model_and_index_ms':first['elapsed_ms'],
                    'warm_search_ms':second['elapsed_ms'], 'model':first['model']}))
                current = data(await session.call_tool('get_note', {'note_id':'Concepts/Reconnect.md'}))
                assert first['results'][0]['revision'] == current['revision']
                for bad in ({'query':'', 'limit':5}, {'query':'x', 'limit':0},
                            {'query':'x', 'limit':51}):
                    assert (await session.call_tool('search_notes', bad)).isError
                assert (await session.call_tool('get_note', {'note_id':'../secret.md'})).isError
    asyncio.run(run())
