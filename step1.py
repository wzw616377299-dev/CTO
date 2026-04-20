#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, os
from collections import Counter, defaultdict
from datetime import datetime

BASE = '/Users/jairwang/Documents/Coding'
path = os.path.join(BASE, '4ce9e6d8-e335-44af-9a70-cc327b308192.ndjson')
rows = []
with open(path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try: rows.append(json.loads(line))
        except: pass

def parse_answer(a):
    if not a: return ''
    try:
        arr = json.loads(a)
        return ''.join(x.get('content','') for x in arr if isinstance(x, dict))
    except: return a

PV = len(rows)
UV = len(set(r.get('openid') for r in rows if r.get('openid')))
SESSION = len(set(r.get('session_id') for r in rows if r.get('session_id')))
SCENE_TXSP = sum(1 for r in rows if r.get('s_session_ai_scene')=='91000022')
SCENE_WXKF = sum(1 for r in rows if r.get('s_session_ai_scene')=='91000069')
UV_TXSP = len(set(r.get('openid') for r in rows if r.get('s_session_ai_scene')=='91000022'))
UV_WXKF = len(set(r.get('openid') for r in rows if r.get('s_session_ai_scene')=='91000069'))
SESS_WXKF = len(set(r.get('session_id') for r in rows if r.get('s_session_ai_scene')=='91000069'))

hour_cnt = Counter(); user_hour = defaultdict(set); date_cnt = Counter()
for r in rows:
    ts = r.get('msg_time')
    if not ts: continue
    dt = datetime.fromtimestamp(ts)
    hour_cnt[dt.hour] += 1
    user_hour[dt.hour].add(r.get('openid'))
    date_cnt[dt.strftime('%m-%d')] += 1

sess_msgs = defaultdict(list)
for r in rows:
    sess_msgs[r.get('session_id')].append(r)
for k in sess_msgs:
    sess_msgs[k].sort(key=lambda x: x.get('msg_time') or 0)

human_q_kw = re.compile(r'人工|转人工|找人|真人|让人|接人|客服[^体]')
ans_transfer_kw = re.compile(r'为你?转(接)?人工|帮你转(接)?人工|已为你转接|转接人工|人工客服|为你?联系人工')

user_human_q = 0; user_human_accept = 0; first_human = 0
for sid, msgs in sess_msgs.items():
    hit_q = any(human_q_kw.search(m.get('question') or '') for m in msgs)
    hit_a = any(ans_transfer_kw.search(parse_answer(m.get('answer'))) for m in msgs)
    if hit_q: user_human_q += 1
    if hit_a: user_human_accept += 1
    q0 = msgs[0].get('question') or ''
    if human_q_kw.search(q0): first_human += 1

msg_human_q = sum(1 for r in rows if human_q_kw.search(r.get('question') or ''))
msg_ai_transfer = sum(1 for r in rows if ans_transfer_kw.search(parse_answer(r.get('answer'))))

# 保存中间指标
import pickle
os.makedirs(os.path.join(BASE,'CTO'), exist_ok=True)
with open(os.path.join(BASE,'CTO','metrics.pkl'),'wb') as f:
    pickle.dump(dict(PV=PV,UV=UV,SESSION=SESSION,SCENE_TXSP=SCENE_TXSP,SCENE_WXKF=SCENE_WXKF,
        UV_TXSP=UV_TXSP,UV_WXKF=UV_WXKF,SESS_WXKF=SESS_WXKF,hour_cnt=dict(hour_cnt),
        user_hour={k:len(v) for k,v in user_hour.items()},date_cnt=dict(date_cnt),
        user_human_q=user_human_q,user_human_accept=user_human_accept,first_human=first_human,
        msg_human_q=msg_human_q,msg_ai_transfer=msg_ai_transfer), f)
print('part1 done')
