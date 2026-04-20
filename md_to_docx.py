#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Markdown -> DOCX 转换（面向客服分析报告，精致中文排版）"""
import re, os
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BASE = '/Users/jairwang/Documents/Coding'
MD = os.path.join(BASE, '微信客服AI对话日志数据分析报告.md')
OUT = os.path.join(BASE, '微信客服AI对话日志数据分析报告.docx')

# --- 设计参数（参考 ChineseGovernment / ModernCorporate recipe）---
FONT_ZH = '思源宋体'        # 将尝试，失败回退宋体
FONT_ZH_FB = '宋体'
FONT_EN = 'Times New Roman'
FONT_H = '思源黑体'
FONT_H_FB = '黑体'
COLOR_PRIMARY = RGBColor(0x1F, 0x3A, 0x5F)   # 深蓝
COLOR_ACCENT = RGBColor(0xC0, 0x39, 0x2B)    # 暗红（强调）
COLOR_GRAY = RGBColor(0x59, 0x59, 0x59)
COLOR_LIGHT = RGBColor(0x8A, 0x8A, 0x8A)
COLOR_TH_BG = '1F3A5F'                        # 表头背景
COLOR_TR_ZEBRA = 'F5F7FA'                     # 斑马条

def set_cn_font(run, font_en=FONT_EN, font_zh=FONT_ZH_FB, size=None, bold=None, color=None):
    run.font.name = font_en
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_zh)
    rFonts.set(qn('w:cs'), font_en)
    if size is not None: run.font.size = Pt(size)
    if bold is not None: run.font.bold = bold
    if color is not None: run.font.color.rgb = color

def shade_cell(cell, color_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color_hex)
    tcPr.append(shd)

def set_cell_borders(cell, color='BFBFBF', sz='4'):
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top','left','bottom','right'):
        b = OxmlElement(f'w:{edge}')
        b.set(qn('w:val'), 'single')
        b.set(qn('w:sz'), sz)
        b.set(qn('w:color'), color)
        tcBorders.append(b)
    tcPr.append(tcBorders)

def add_horizontal_line(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '1F3A5F')
    pBdr.append(bottom)
    pPr.append(pBdr)

# --- 读取 markdown ---
with open(MD, 'r', encoding='utf-8') as f:
    md = f.read()

# 去掉 BOM / windows CR
md = md.replace('\r\n', '\n')
lines = md.split('\n')

doc = Document()

# 页面设置：A4 + 合理边距
section = doc.sections[0]
section.page_height = Cm(29.7)
section.page_width = Cm(21.0)
section.top_margin = Cm(2.54)
section.bottom_margin = Cm(2.54)
section.left_margin = Cm(2.8)
section.right_margin = Cm(2.8)

# 默认样式（Normal）
normal = doc.styles['Normal']
normal.font.name = FONT_EN
normal.font.size = Pt(10.5)  # 五号
normal._element.get_or_add_rPr()
rFonts = OxmlElement('w:rFonts')
rFonts.set(qn('w:ascii'), FONT_EN)
rFonts.set(qn('w:hAnsi'), FONT_EN)
rFonts.set(qn('w:eastAsia'), FONT_ZH_FB)
rFonts.set(qn('w:cs'), FONT_EN)
normal._element.rPr.append(rFonts)

# ===== 封面 =====
for _ in range(4):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run('微信客服 AI 对话日志')
set_cn_font(r, size=28, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run('数据分析报告')
set_cn_font(r, size=28, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(18)
r = p.add_run('Tencent Video Smart Customer Service Analytics')
set_cn_font(r, size=13, color=COLOR_GRAY)
r.italic = True

# 分隔线
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(30)
p.paragraph_format.space_after = Pt(30)
add_horizontal_line(p)

# 元信息表
for _ in range(2): doc.add_paragraph()
meta_lines = [
    ('分析周期', '2026-04-18 ~ 2026-04-19（共 2 天）'),
    ('数据规模', '26,741 条消息 / 9,222 位独立用户 / 12,722 个会话'),
    ('协议依据', 'TrpcSmartKfConnectAiSvr（微信客服/腾讯视频智能客服）'),
    ('报告作者', 'AI 数据分析'),
    ('生成日期', '2026-04-20'),
]
for k, v in meta_lines:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(f'{k}：')
    set_cn_font(r, size=11, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)
    r = p.add_run(v)
    set_cn_font(r, size=11, color=COLOR_GRAY)

doc.add_page_break()

# ===== MD 解析与渲染 =====

def add_heading_para(doc, text, level):
    p = doc.add_paragraph()
    if level == 1:
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after = Pt(12)
        # 左侧色块
        pPr = p._p.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        left = OxmlElement('w:left')
        left.set(qn('w:val'), 'single')
        left.set(qn('w:sz'), '24')
        left.set(qn('w:space'), '8')
        left.set(qn('w:color'), '1F3A5F')
        pBdr.append(left)
        pPr.append(pBdr)
        r = p.add_run(text)
        set_cn_font(r, size=18, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)
        p.paragraph_format.left_indent = Pt(8)
    elif level == 2:
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(8)
        r = p.add_run(text)
        set_cn_font(r, size=15, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)
        # 底部细线
        pPr = p._p.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '6')
        bottom.set(qn('w:space'), '1')
        bottom.set(qn('w:color'), 'BFBFBF')
        pBdr.append(bottom)
        pPr.append(pBdr)
    elif level == 3:
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run('◆ ')
        set_cn_font(r, size=12, bold=True, color=COLOR_ACCENT, font_zh=FONT_H_FB)
        r = p.add_run(text)
        set_cn_font(r, size=12.5, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)
    else:
        r = p.add_run(text)
        set_cn_font(r, size=11, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)
    return p

INLINE_RE = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`)')

def add_runs_with_inline(p, text, base_size=10.5, base_color=None):
    """解析 **bold** 和 `code`，生成多 run。"""
    text = text.replace('  ', '  ')
    # 转义不处理
    parts = []
    last = 0
    for m in INLINE_RE.finditer(text):
        if m.start() > last:
            parts.append(('text', text[last:m.start()]))
        tk = m.group(0)
        if tk.startswith('**'):
            parts.append(('bold', tk[2:-2]))
        elif tk.startswith('`'):
            parts.append(('code', tk[1:-1]))
        last = m.end()
    if last < len(text):
        parts.append(('text', text[last:]))
    if not parts:
        parts = [('text', text)]
    for kind, t in parts:
        if not t: continue
        r = p.add_run(t)
        if kind == 'bold':
            set_cn_font(r, size=base_size, bold=True, color=COLOR_ACCENT if base_color is None else base_color, font_zh=FONT_H_FB)
        elif kind == 'code':
            r.font.name = 'Consolas'
            rP = r._element.get_or_add_rPr()
            rFonts = OxmlElement('w:rFonts')
            rFonts.set(qn('w:ascii'), 'Consolas')
            rFonts.set(qn('w:hAnsi'), 'Consolas')
            rFonts.set(qn('w:eastAsia'), FONT_ZH_FB)
            rP.append(rFonts)
            r.font.size = Pt(base_size - 0.5)
            r.font.color.rgb = RGBColor(0xC7, 0x25, 0x4E)
            # 浅灰底色（通过 shd 元素）
            shd = OxmlElement('w:shd')
            shd.set(qn('w:val'), 'clear')
            shd.set(qn('w:color'), 'auto')
            shd.set(qn('w:fill'), 'F2F2F2')
            rP.append(shd)
        else:
            set_cn_font(r, size=base_size, color=base_color or COLOR_GRAY)

def add_bullet(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.7)
    p.paragraph_format.first_line_indent = Cm(-0.35)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.5
    r = p.add_run('• ')
    set_cn_font(r, size=11, bold=True, color=COLOR_PRIMARY, font_zh=FONT_H_FB)
    add_runs_with_inline(p, text, base_size=10.5, base_color=RGBColor(0x33,0x33,0x33))
    return p

def add_ordered(doc, idx, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.first_line_indent = Cm(-0.5)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.5
    r = p.add_run(f'{idx}. ')
    set_cn_font(r, size=11, bold=True, color=COLOR_ACCENT, font_zh=FONT_H_FB)
    add_runs_with_inline(p, text, base_size=10.5, base_color=RGBColor(0x33,0x33,0x33))
    return p

def add_quote(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.5)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    # 左边框
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    left = OxmlElement('w:left')
    left.set(qn('w:val'), 'single')
    left.set(qn('w:sz'), '18')
    left.set(qn('w:space'), '8')
    left.set(qn('w:color'), 'C0C8D0')
    pBdr.append(left)
    pPr.append(pBdr)
    # 浅灰底
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'),'auto'); shd.set(qn('w:fill'),'F7F9FC')
    pPr.append(shd)
    add_runs_with_inline(p, text, base_size=10.5, base_color=RGBColor(0x55,0x55,0x55))

def add_paragraph_text(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.first_line_indent = Pt(21)  # 中文首行缩进 2 字符
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.6
    add_runs_with_inline(p, text, base_size=10.5, base_color=RGBColor(0x33,0x33,0x33))

def render_table(doc, rows):
    """rows: list of list[str]（第一行为表头）"""
    if not rows: return
    ncol = max(len(r) for r in rows)
    for r in rows: r += [''] * (ncol - len(r))
    table = doc.add_table(rows=len(rows), cols=ncol)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    # 表头
    for j, cell_text in enumerate(rows[0]):
        cell = table.cell(0, j)
        shade_cell(cell, COLOR_TH_BG)
        set_cell_borders(cell, 'FFFFFF', '4')
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].paragraph_format.space_before = Pt(3)
        cell.paragraphs[0].paragraph_format.space_after = Pt(3)
        # 清除默认 run
        for run in cell.paragraphs[0].runs: run.text = ''
        add_runs_with_inline(cell.paragraphs[0], cell_text, base_size=10)
        # 强制表头颜色白色/加粗
        for run in cell.paragraphs[0].runs:
            run.font.color.rgb = RGBColor(0xFF,0xFF,0xFF)
            run.font.bold = True
    # 数据行
    for i in range(1, len(rows)):
        zebra = (i % 2 == 0)
        for j, cell_text in enumerate(rows[i]):
            cell = table.cell(i, j)
            if zebra: shade_cell(cell, COLOR_TR_ZEBRA)
            set_cell_borders(cell, 'D9D9D9', '4')
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            # 居中/左对齐规则：首列左，其余根据是否纯数字/百分比居中
            txt = cell_text.strip()
            is_numeric = bool(re.match(r'^[\-+]?[\d,\.%★（）()\s]+$', txt)) or txt in ('—','-')
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if (j > 0 and is_numeric) else (WD_ALIGN_PARAGRAPH.LEFT if j == 0 else WD_ALIGN_PARAGRAPH.CENTER)
            for run in p.runs: run.text = ''
            add_runs_with_inline(p, cell_text, base_size=9.5, base_color=RGBColor(0x33,0x33,0x33))

def parse_md_table(lines, start):
    """从 start 行开始解析 GFM 表格，返回 (rows, next_index)"""
    rows = []
    i = start
    # 第一行表头
    header = [c.strip() for c in lines[i].strip().strip('|').split('|')]
    rows.append(header)
    i += 1
    # 分隔行 |---|---|
    if i < len(lines) and re.match(r'^\s*\|?\s*:?-+', lines[i]):
        i += 1
    # 数据行
    while i < len(lines) and lines[i].strip().startswith('|'):
        cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
        rows.append(cells)
        i += 1
    return rows, i

# ===== 主渲染循环 =====
i = 0
in_blockquote = False
order_counter = 0
skip_h1 = False  # 跳过首个 H1（我们封面已呈现）

while i < len(lines):
    line = lines[i]
    stripped = line.strip()

    # 跳过空行
    if not stripped:
        # 连续空行压缩
        order_counter = 0
        i += 1
        continue

    # 水平分割线
    if re.match(r'^-{3,}$', stripped) or re.match(r'^={3,}$', stripped):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(6)
        add_horizontal_line(p)
        i += 1
        continue

    # 标题
    m = re.match(r'^(#{1,6})\s+(.+)$', stripped)
    if m:
        level = len(m.group(1)); txt = m.group(2).strip()
        if level == 1 and not skip_h1:
            skip_h1 = True
            i += 1; continue
        # 去掉行尾 emoji 的前置空格冗余
        add_heading_para(doc, txt, level)
        i += 1; order_counter = 0
        continue

    # 表格
    if stripped.startswith('|') and i+1 < len(lines) and re.match(r'^\s*\|?\s*:?-+', lines[i+1]):
        rows, ni = parse_md_table(lines, i)
        render_table(doc, rows)
        # 表格后空一段
        doc.add_paragraph().paragraph_format.space_after = Pt(2)
        i = ni
        continue

    # 引用
    if stripped.startswith('>'):
        qtext = re.sub(r'^>\s?', '', stripped)
        # 连续引用合并
        qparts = [qtext]
        j = i + 1
        while j < len(lines) and lines[j].strip().startswith('>'):
            qparts.append(re.sub(r'^>\s?', '', lines[j].strip()))
            j += 1
        add_quote(doc, '\n'.join(qparts).strip())
        i = j
        continue

    # 无序列表
    if re.match(r'^[-*]\s+', stripped):
        txt = re.sub(r'^[-*]\s+', '', stripped)
        add_bullet(doc, txt)
        i += 1; continue

    # 有序列表
    m = re.match(r'^(\d+)\.\s+(.+)$', stripped)
    if m:
        add_ordered(doc, m.group(1), m.group(2))
        i += 1; continue

    # 普通段落
    add_paragraph_text(doc, stripped)
    i += 1

# ===== 页脚页码 =====
for sec in doc.sections:
    footer = sec.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in fp.runs: r.text = ''
    r1 = fp.add_run('微信客服 AI 对话日志数据分析报告  |  第 ')
    set_cn_font(r1, size=9, color=COLOR_LIGHT)
    # 页码字段
    fldChar1 = OxmlElement('w:fldChar'); fldChar1.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText'); instrText.set(qn('xml:space'),'preserve'); instrText.text = 'PAGE'
    fldChar2 = OxmlElement('w:fldChar'); fldChar2.set(qn('w:fldCharType'), 'end')
    r2 = fp.add_run(); r2._r.append(fldChar1); r2._r.append(instrText); r2._r.append(fldChar2)
    set_cn_font(r2, size=9, color=COLOR_LIGHT)
    r3 = fp.add_run(' 页 / 共 ')
    set_cn_font(r3, size=9, color=COLOR_LIGHT)
    fldChar3 = OxmlElement('w:fldChar'); fldChar3.set(qn('w:fldCharType'), 'begin')
    instrText2 = OxmlElement('w:instrText'); instrText2.set(qn('xml:space'),'preserve'); instrText2.text = 'NUMPAGES'
    fldChar4 = OxmlElement('w:fldChar'); fldChar4.set(qn('w:fldCharType'), 'end')
    r4 = fp.add_run(); r4._r.append(fldChar3); r4._r.append(instrText2); r4._r.append(fldChar4)
    set_cn_font(r4, size=9, color=COLOR_LIGHT)
    r5 = fp.add_run(' 页')
    set_cn_font(r5, size=9, color=COLOR_LIGHT)

doc.save(OUT)
print('生成完成:', OUT)
print('文件大小:', os.path.getsize(OUT), 'bytes')
