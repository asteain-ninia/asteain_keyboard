# -*- coding: utf-8 -*-
"""かな関連ブロックのうち、フォントに未収録の文字を一覧する。usage: python coverage.py <font>"""
import sys
import unicodedata

from fontTools.ttLib import TTFont

BLOCKS = [
    ("カタカナ U+30A0-30FF", 0x30A0, 0x30FF),
    ("カタカナ拡張 U+31F0-31FF", 0x31F0, 0x31FF),
    ("小書き拡張 U+1B120-1B167", 0x1B120, 0x1B167),
    ("ひらがな U+3041-309F", 0x3041, 0x309F),
]


def name(cp):
    try:
        return unicodedata.name(chr(cp))
    except ValueError:
        return "(名称なし)"


def main():
    cmap = TTFont(sys.argv[1]).getBestCmap()
    for title, lo, hi in BLOCKS:
        have, miss = [], []
        for cp in range(lo, hi + 1):
            n = name(cp)
            if n == "(名称なし)":
                continue  # 未定義コードポイント
            (have if cp in cmap else miss).append(cp)
        print(f"\n■ {title}  収録 {len(have)} / 未収録 {len(miss)}")
        if not miss:
            print("   すべて収録済み")
            continue
        if len(miss) > 40:
            print(f"   ほぼ全域が未収録: {chr(miss[0])}({miss[0]:04X}) 〜 {chr(miss[-1])}({miss[-1]:04X})")
            continue
        for cp in miss:
            print(f"   U+{cp:04X} {chr(cp)}\t{name(cp)}")


if __name__ == "__main__":
    main()
