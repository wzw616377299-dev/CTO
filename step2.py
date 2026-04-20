#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, os, pickle
from collections import Counter, defaultdict
from datetime import datetime

BASE = '/Users/jairwang/Documents/Coding'
path = os.path.join(BASE, '4ce9e6d8-e335-44af-9a70-cc327b308192.ndjson')
rows = []
with open(path,'r',encoding='utf-8') as f:
    for line in f:
        line=line.strip()
        if not line: continue
        try: rows.append(json.loads(line))
        except: pass

def parse_answer(a):
    if not a: return ''
    try:
        arr = json.loads(a)
        return ''.join(x.get('content','') for x in arr if isinstance(x,dict))
    except: return a

sess_msgs = defaultdict(list)
for r in rows: sess_msgs[r.get('session_id')].append(r)
for k in sess_msgs: sess_msgs[k].sort(key=lambda x: x.get('msg_time') or 0)

# 咨询类型分类
categories = [
    ('退费/退款',       r'退(款|费)|退订|退钱|扣(费|钱).*?退'),
    ('自动续费',        r'自动续费|关闭续费|取消续费|连续(包|订)|续订'),
    ('会员开通/购买',    r'开通|购买|充值|买了?会员|如何变成|怎么(才能)?开|怎么买|怎么充'),
    ('重复扣费/异常扣费',r'重复扣|多扣|乱扣|莫名其?妙扣|为什么扣|扣错|未开通.*扣'),
    ('VIP/SVIP权益差异',r'svip|SVIP|超级会员|升级|区别|和vip|vip有什么|权益'),
    ('共享/分享/设备',   r'共享|分享|赠送|礼品卡|几(个|台)设备|设备|登录上限|多设备'),
    ('账号/登录/密码',   r'登录|登陆|账号|忘记密码|修改密码|找回|绑定|换号|换绑|注销'),
    ('投诉/举报/不满',   r'投诉|举报|差评|垃圾|骗|坑|欺骗|乱收费|黑心|差劲'),
    ('价格/活动/优惠',   r'多少钱|价格|优惠|折扣|活动|券|便宜'),
    ('播放/卡顿/画质',   r'卡顿|不能看|无法播放|黑屏|画质|清晰度|蓝光|4k|4K|闪退|打不开'),
    ('投屏/设备使用',    r'投屏|电视|tv|TV|云视听|智能屏|大屏'),
    ('发票/开票',        r'发票|开票|报销'),
    ('客服/人工/转接',   r'人工|客服|真人|转接'),
]
cat_hit = Counter(); cat_detail = defaultdict(list)
for r in rows:
    q = r.get('question') or ''
    matched = False
    for name, pat in categories:
        if re.search(pat, q, re.I):
            cat_hit[name] += 1
            if len(cat_detail[name]) < 3: cat_detail[name].append(q[:40])
            matched = True
            break
    if not matched:
        cat_hit['其他/未分类'] += 1

# 满意度
human_q_kw = re.compile(r'人工|转人工|找人|真人|让人|接人|客服[^体]')
neg_kw = re.compile(r'垃圾|骗|坑|欺骗|乱收费|黑心|差劲|投诉|举报|吐槽|不满|恶心|搞什么|什么破|气死|气人|烦')
strong_neg = re.compile(r'骗|坑|投诉|举报|垃圾|乱收费|恶心|气死')
pos_kw = re.compile(r'谢谢|感谢|好的|明白了|知道了|OK|ok|收到|可以了|解决了|搞定')
unresolved = re.compile(r'没用|没解决|还是不行|不管用|你没懂|你听不懂|胡说|答非所问|不对|不是这个|重新')

sent_neg = sent_pos = sent_unresolved = sent_strong_neg = 0
sat_scores = []; iv = []
for sid, msgs in sess_msgs.items():
    text = ' '.join((m.get('question') or '') for m in msgs)
    neg = bool(neg_kw.search(text)); pos = bool(pos_kw.search(text))
    unsol = bool(unresolved.search(text)); sneg = bool(strong_neg.search(text))
    hint_human = bool(human_q_kw.search(text)); turns = len(msgs)
    score = 4.0
    if pos: score += 0.8
    if neg: score -= 1.0
    if sneg: score -= 1.2
    if unsol: score -= 0.8
    if hint_human and not pos: score -= 0.4
    if turns >= 6 and not pos: score -= 0.5
    if turns == 1 and not neg: score += 0.2
    score = max(1.0, min(5.0, score))
    sat_scores.append(score)
    if neg: sent_neg += 1
    if pos: sent_pos += 1
    if unsol: sent_unresolved += 1
    if sneg: sent_strong_neg += 1
    for i in range(1, len(msgs)):
        d = (msgs[i].get('msg_time') or 0) - (msgs[i-1].get('msg_time') or 0)
        if 0 < d < 3600*6: iv.append(d)

iv.sort()
cl = [len(v) for v in sess_msgs.values()]; cl.sort()
dist = Counter()
for s in sat_scores:
    if s >= 4.5: dist['非常满意(5★)'] += 1
    elif s >= 3.5: dist['满意(4★)'] += 1
    elif s >= 2.5: dist['一般(3★)'] += 1
    elif s >= 1.5: dist['不满意(2★)'] += 1
    else: dist['非常不满(1★)'] += 1

with open(os.path.join(BASE,'CTO','metrics2.pkl'),'wb') as f:
    pickle.dump(dict(cat_hit=dict(cat_hit),cat_detail=dict(cat_detail),
        sent_neg=sent_neg,sent_pos=sent_pos,sent_unresolved=sent_unresolved,sent_strong_neg=sent_strong_neg,
        avg_sat=sum(sat_scores)/len(sat_scores),dist=dict(dist),
        iv_avg=sum(iv)/len(iv) if iv else 0,iv_p50=iv[len(iv)//2] if iv else 0,
        iv_p90=iv[int(len(iv)*0.9)] if iv else 0,iv_p99=iv[int(len(iv)*0.99)] if iv else 0,
        cl_avg=sum(cl)/len(cl),cl_median=cl[len(cl)//2],cl_max=max(cl),
        c1=sum(1 for x in cl if x==1),c23=sum(1 for x in cl if 2<=x<=3),
        c49=sum(1 for x in cl if 4<=x<=9),c10p=sum(1 for x in cl if x>=10),
        total_cat=sum(cat_hit.values()),total_sess=len(cl)), f)
print('part2 done')
