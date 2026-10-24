"""Real STDIO MCP exchange against disposable local git repos; not a VS Code acceptance test."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def git(root,*args):
    return subprocess.run(['git','-C',str(root),*args],check=True,capture_output=True,text=True).stdout.strip()


def test_stdio_tools(tmp_path):
    app=tmp_path/'app';app.mkdir();git(app,'init','--initial-branch=main')
    remote=tmp_path/'remote.git';remote.mkdir();git(remote,'init','--bare','--initial-branch=main')
    root=tmp_path/'vault';git(tmp_path,'clone',str(remote),str(root))
    git(root,'config','user.name','Transport Test');git(root,'config','user.email','mcp@example.invalid')
    (root/'MOC-Drive2U.md').write_text('---\ntype: moc\ncreated: 2026-10-22\nupdated: 2026-10-22\nstatus: active\ntags: [drive2u]\nsource: fixture\n---\n\n# MOC\n')
    (root/'Conventions.md').write_text('---\ntype: convention\ncreated: 2026-10-22\nupdated: 2026-10-22\nstatus: active\ntags: [drive2u, convention]\nsource: fixture\n---\n\n# Conventions\nExisting rules.\n',encoding='utf-8')
    git(root,'add','.');git(root,'commit','-m','initial');git(root,'push','-u','origin','main')
    async def run():
        params=StdioServerParameters(command=sys.executable,
            args=[str(Path(__file__).resolve().parents[1]/'server.py')],
            env={**os.environ,'DRIVE2U_APP_ROOT':str(app),'DRIVE2U_VAULT_ROOT':str(root),'KNOWLEDGE_ALLOW_WRITE':'1'})
        async with stdio_client(params) as (read,write):
            async with ClientSession(read,write) as session:
                await session.initialize()
                tools=await session.list_tools()
                assert {t.name for t in tools.tools}=={'health_check','get_note','search_notes','ingest_note'}
                h=await session.call_tool('health_check',{})
                assert not h.isError
                for title in ['Transport-Read','Transport-Search','Transport-Write']:
                    args={'title':title,'note_type':'concept','content':f'# {title}\nSynthetic protocol fixture.', 'source':'synthetic integration test'}
                    first=await session.call_tool('ingest_note',args)
                    assert not first.isError
                    data=first.structuredContent or json.loads(first.content[0].text)
                    assert data['published'] and data['status']=='created'
                    repeated=await session.call_tool('ingest_note',args)
                    data=repeated.structuredContent or json.loads(repeated.content[0].text)
                    assert not repeated.isError and data['status']=='unchanged'
                note=await session.call_tool('get_note',{'note_id':'Concepts/Transport-Read.md'})
                assert not note.isError
                search=await session.call_tool('search_notes',{'query':'Transport'})
                assert not search.isError
                denied=await session.call_tool('get_note',{'note_id':'../secret.md'})
                assert denied.isError
                conventions=await session.call_tool('get_note',{'note_id':'Conventions.md'})
                assert not conventions.isError
                old=conventions.structuredContent or json.loads(conventions.content[0].text)
                args={'title':'Conventions','note_type':'convention',
                      'content':'# Conventions\nExisting rules.\nTyped relations.',
                      'source':'drive2u/docs/ontology.md','status':'active',
                      'expected_revision':old['revision']}
                updated=await session.call_tool('ingest_note',args)
                assert not updated.isError
                first=updated.structuredContent or json.loads(updated.content[0].text)
                assert first['status']=='updated' and first['published']
                assert first['note_id']=='Conventions.md'
                repeated=await session.call_tool('ingest_note',args)
                assert not repeated.isError
                same=repeated.structuredContent or json.loads(repeated.content[0].text)
                assert same['status']=='unchanged' and same['commit']==first['commit']
                stale=await session.call_tool('ingest_note',{**args,'content':'# Different'})
                assert stale.isError and 'REVISION_CONFLICT' in str(stale.content)
                denied=await session.call_tool('ingest_note',{**args,'title':'Other'})
                assert denied.isError and 'INVALID_TITLE_OR_TYPE' in str(denied.content)
    asyncio.run(run())
    assert git(remote,'rev-parse','main')==git(root,'rev-parse','HEAD')
