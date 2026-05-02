#!/usr/bin/env python3
"""md-to-pdf 兼容入口 — 调用 md2pdf.py 生成中文 PDF

兼容 Node.js 旧接口:
  python3 scripts/md-to-pdf.py <input.md> [output.pdf]
"""

import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MD2PDF = os.path.join(SCRIPT_DIR, "md2pdf.py")

if not os.path.exists(MD2PDF):
    print(f"错误: md2pdf.py 未找到: {MD2PDF}", file=sys.stderr)
    sys.exit(1)

# 传递参数
args = [sys.executable, MD2PDF] + sys.argv[1:]
os.execv(sys.executable, args)
