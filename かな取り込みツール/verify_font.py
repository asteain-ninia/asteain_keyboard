# -*- coding: utf-8 -*-
"""ffpython で実行: ビルド済みフォントの収録状態を検証する。usage: ffpython verify_font.py <font>"""
import sys

import fontforge

font = fontforge.open(sys.argv[1])
total = sum(1 for _ in font.glyphs())
kana_bmp = [g for g in font.glyphs() if 0x3040 <= g.unicode <= 0x31FF]
kana_ext = [g for g in font.glyphs() if 0x1B100 <= g.unicode <= 0x1B16F]
print("glyphs total = %d" % total)
print("kana (3040-31FF) = %d / ext (1B1xx) = %d" % (len(kana_bmp), len(kana_ext)))

a = font["a"]
print("ASCII 'a': width=%d (expect 1248)" % a.width)
for cp, label in [(0x30A2, "A"), (0x30CB, "NI"), (0x30E6, "YU"), (0x30F3, "N")]:
    g = font[cp]
    b = g.boundingBox()
    print("U+%04X %s: width=%d vwidth=%d bbox=(%.0f, %.0f, %.0f, %.0f)" % (cp, label, g.width, g.vwidth, b[0], b[1], b[2], b[3]))
# ニ・ユの底がベースライン (+6) に着地しているか
for cp in (0x30CB, 0x30E6):
    ymin = font[cp].boundingBox()[1]
    print("U+%04X ymin=%.0f (expect 6)" % (cp, ymin))
