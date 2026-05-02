#!/usr/bin/env python3
"""CodeEngine — Markdown 转 PDF 工具 (基于 fpdf2 + macOS STHeiti 中文字体)

用法:
  python3 scripts/md2pdf.py input.md [output.pdf]

依赖: pip3 install fpdf2 markdown
"""

from fpdf import FPDF
import re
import os
import sys

MD_PATH = "input.md"
PDF_PATH = "output.pdf"
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"


class PDF(FPDF):
    def __init__(self):
        super().__init__()
        self.add_font("CN", "", FONT_PATH)
        self.toc_entries = []


def write_line(pdf, text, size=10):
    pdf.set_font("CN", size=size)
    max_w = pdf.w - pdf.l_margin - pdf.r_margin - 5
    if pdf.get_string_width(text) <= max_w:
        pdf.cell(0, size * 0.6, text, new_x="LMARGIN", new_y="NEXT")
        return
    chunk = 40
    while text:
        if len(text) <= chunk:
            pdf.cell(0, size * 0.55, text, new_x="LMARGIN", new_y="NEXT")
            break
        pdf.cell(0, size * 0.55, text[:chunk], new_x="LMARGIN", new_y="NEXT")
        text = text[chunk:]


def convert(md_path, pdf_path):
    with open(md_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(25, 20, 25)
    pdf.add_page()

    in_code = False
    code_buf = []
    in_table = False
    table_rows = []
    chapter_counter = 0

    def flush_code():
        nonlocal code_buf, in_code
        if code_buf:
            pdf.set_font("CN", size=7)
            pdf.set_fill_color(245, 245, 245)
            for cl in code_buf[:150]:
                pdf.cell(pdf.w - 50, 3.5, cl.rstrip()[:130], new_x="LMARGIN", new_y="NEXT", fill=True)
            pdf.ln(3)
        code_buf = []
        in_code = False

    def flush_table():
        nonlocal table_rows, in_table
        if len(table_rows) >= 2:
            avail = pdf.w - 50
            nc = len(table_rows[0])
            cw = avail / nc
            pdf.set_font("CN", size=9)
            pdf.set_fill_color(230, 230, 230)
            for cell in table_rows[0]:
                pdf.cell(cw, 7, cell[:30], border=1, fill=True, new_x="RIGHT")
            pdf.ln()
            pdf.set_draw_color(180, 180, 180)
            pdf.line(pdf.x, pdf.y - 1, pdf.x + avail, pdf.y - 1)
            pdf.ln(1)
            pdf.set_draw_color(0)
            for row in table_rows[1:]:
                pdf.set_font("CN", size=8)
                pdf.set_fill_color(255, 255, 255)
                for cell in row:
                    pdf.cell(cw, 6, cell[:30], border=1, fill=True, new_x="RIGHT")
                pdf.ln()
        table_rows = []
        in_table = False

    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n')
        s = line.strip()

        if s.startswith('```'):
            flush_table()
            if in_code:
                flush_code()
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        if s.startswith('|') and '|' in s[1:]:
            if not in_table:
                in_table = True
                table_rows = []
            cells = [c.strip() for c in s.split('|')[1:-1]]
            if all(re.match(r'^-[\s-]*$', c) for c in cells):
                i += 1
                continue
            table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            flush_table()

        if not s:
            i += 1
            continue

        # H1
        m = re.match(r'^#\s+(.+)$', s)
        if m:
            flush_table(); flush_code()
            if chapter_counter > 0:
                pdf.add_page()
            pdf.set_font("CN", size=20)
            pdf.set_fill_color(41, 98, 255)
            pdf.set_text_color(255, 255, 255)
            pdf.set_draw_color(41, 98, 255)
            pdf.line(pdf.l_margin, pdf.y - 2, pdf.w - pdf.r_margin, pdf.y - 2)
            pdf.cell(0, 16, " " + m.group(1), new_x="LMARGIN", new_y="NEXT", fill=True)
            pdf.set_text_color(0, 0, 0)
            chapter_counter += 1
            pdf.ln(4)
            pdf.toc_entries.append({"title": m.group(1), "level": 1})
            i += 1
            continue

        m = re.match(r'^##\s+(.+)$', s)
        if m:
            flush_table(); flush_code()
            pdf.set_draw_color(41, 98, 255)
            pdf.line(pdf.l_margin, pdf.y, pdf.w - pdf.r_margin, pdf.y)
            pdf.ln(3)
            pdf.set_font("CN", size=16)
            pdf.cell(0, 12, m.group(1), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
            pdf.toc_entries.append({"title": m.group(1), "level": 2})
            i += 1
            continue

        m = re.match(r'^###\s+(.+)$', s)
        if m:
            flush_table(); flush_code()
            pdf.set_font("CN", size=13)
            pdf.cell(0, 10, m.group(1), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
            pdf.toc_entries.append({"title": m.group(1), "level": 3})
            i += 1
            continue

        m = re.match(r'^####+\s+(.+)$', s)
        if m:
            flush_table(); flush_code()
            level = len(m.group(0)) - len(m.group(0).lstrip('#'))
            indent = "  " * max(0, level - 3)
            pdf.set_font("CN", size=10)
            pdf.cell(0, 8, indent + m.group(1), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
            pdf.toc_entries.append({"title": m.group(1), "level": level})
            i += 1
            continue

        m = re.match(r'^[-*]\s+(.+)$', s)
        if m:
            flush_table(); flush_code()
            pdf.set_font("CN", size=10)
            pdf.cell(10, 6, "•", new_x="RIGHT")
            pdf.cell(0, 6, m.group(1)[:100], new_x="LMARGIN", new_y="NEXT")
            i += 1
            continue

        m = re.match(r'^- \[([ xX])\]\s+(.+)$', s)
        if m:
            flush_table(); flush_code()
            pdf.set_font("CN", size=10)
            sym = "☑" if m.group(1) in ("x", "X") else "☐"
            pdf.cell(10, 6, sym, new_x="RIGHT")
            pdf.cell(0, 6, m.group(2)[:100], new_x="LMARGIN", new_y="NEXT")
            i += 1
            continue

        if '`' in s:
            s = re.sub(r'`([^`]+)`', r'[CODE: \1]', s)

        flush_table(); flush_code()
        write_line(pdf, s[:200], size=10)
        i += 1

    flush_code()
    flush_table()

    # 目录
    pdf.add_page()
    pdf.set_font("CN", size=20)
    pdf.cell(0, 15, "目  录", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(8)
    for e in pdf.toc_entries:
        indent = "  " * (e["level"] - 1)
        pdf.set_font("CN", size=10)
        pdf.cell(0, 7, indent + e["title"][:40], new_x="LMARGIN", new_y="NEXT")

    pdf.output(pdf_path)
    size = os.path.getsize(pdf_path)
    print(f"PDF: {pdf_path} ({size/1024:.0f} KB, {len(pdf.pages)} pages)")


if __name__ == "__main__":
    md = sys.argv[1] if len(sys.argv) > 1 else MD_PATH
    pdf_out = sys.argv[2] if len(sys.argv) > 2 else PDF_PATH
    if not os.path.exists(md):
        print(f"File not found: {md}")
        sys.exit(1)
    convert(md, pdf_out)
