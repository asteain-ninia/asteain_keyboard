# -*- coding: utf-8 -*-
"""かな収録で追加したグリフの一覧 HTML を manifest.json から生成する。

  python gen_glyph_list.py [../グリフsvg/かなもじ/manifest.json] [かな収録一覧.html]

- 収録済みの字は asteain 自身 (../asteain.woff) で表示する
- 符号位置が無く SVG 保存のみの字は、グリフ SVG を直接 <img> で表示する
- 自動生成ぶん (全角形・借用・縦書き変体など) は 自動生成対応表.html に任せ、
  ここでは件数とリンクだけ載せる
"""
import html
import json
import sys
from pathlib import Path

MANIFEST = Path(sys.argv[1] if len(sys.argv) > 1 else "../グリフsvg/かなもじ/manifest.json")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "かな収録一覧.html")
SVGDIR_REL = "../グリフsvg/かなもじ"  # 出力 HTML から見た相対パス

GROUPS = [
    ("ひらがな", lambda cp: 0x3041 <= cp <= 0x309F),
    ("カタカナ", lambda cp: 0x30A0 <= cp <= 0x30FF),
    ("カタカナ拡張（アイヌ語用小書き）", lambda cp: 0x31F0 <= cp <= 0x31FF),
    ("古字・小書き拡張", lambda cp: 0x1B000 <= cp <= 0x1B16F),
    ("和字記号", lambda cp: 0x3000 <= cp <= 0x303F),
    ("全角形（図面から）", lambda cp: 0xFF00 <= cp <= 0xFF5E),
]


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    mapped = [m for m in manifest if m["cp"]]
    unmapped = [m for m in manifest if not m["cp"]]

    sections = []
    used = set()
    for title, pred in GROUPS:
        items = sorted((m for m in mapped if pred(m["cp"])), key=lambda m: m["cp"])
        if not items:
            continue
        used.update(m["file"] for m in items)
        cells = "\n".join(
            f"<div class='cell'><div class='g'>{html.escape(chr(m['cp']))}</div>"
            f"<div class='ref'>{html.escape(chr(m['cp']))}</div>"
            f"<div class='cp'>U+{m['cp']:04X}</div></div>"
            for m in items
        )
        sections.append(f"<h2>{title}（{len(items)} 字）</h2>\n<div class='grid'>\n{cells}\n</div>")

    leftover = [m for m in mapped if m["file"] not in used]
    if leftover:
        cells = "\n".join(
            f"<div class='cell'><div class='g'>{html.escape(chr(m['cp']))}</div>"
            f"<div class='ref'>{html.escape(chr(m['cp']))}</div>"
            f"<div class='cp'>U+{m['cp']:04X}</div></div>"
            for m in sorted(leftover, key=lambda m: m["cp"])
        )
        sections.append(f"<h2>その他（{len(leftover)} 字）</h2>\n<div class='grid'>\n{cells}\n</div>")

    if unmapped:
        cells = "\n".join(
            f"<div class='cell'><img src='{SVGDIR_REL}/{html.escape(m['file'])}' alt=''>"
            f"<div class='cp'>{html.escape(m['label'])}</div></div>"
            for m in sorted(unmapped, key=lambda m: m["label"])
        )
        sections.append(
            f"<h2>符号位置なし・SVG 保存のみ（{len(unmapped)} 字）</h2>\n"
            f"<p>Unicode に居場所が無い字。フォントには入らないが図面は保存してある。</p>\n"
            f"<div class='grid'>\n{cells}\n</div>"
        )

    body = "\n".join(sections)
    doc = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<title>asteain かな収録一覧</title>
<style>
@font-face {{ font-family: asteain; src: url("../asteain.woff") format("woff"); }}
body {{ font-family: sans-serif; margin: 24px; font-size: 14px; }}
h1 {{ font-size: 18px; }}
h2 {{ font-size: 15px; margin: 22px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }}
p {{ color: #555; margin: 2px 0; }}
.grid {{ display: flex; flex-wrap: wrap; gap: 6px; }}
.cell {{ width: 64px; border: 1px solid #e0e0e0; border-radius: 4px; text-align: center; padding: 6px 0 3px; }}
.g {{ font-family: asteain, sans-serif; font-size: 34px; line-height: 1.2; }}
.ref {{ font-family: "Yu Gothic", "Meiryo", sans-serif; font-size: 15px; color: #555; line-height: 1.1; }}
.cell img {{ width: 30px; height: 34px; }}
.cp {{ font-family: monospace; font-size: 10px; color: #777; margin-top: 2px; }}
</style></head><body>
<h1>asteain かな収録一覧（図面から取り込んだ {len(mapped)} 字 + SVG のみ {len(unmapped)} 字）</h1>
<p>グリフsvg/かなもじ/manifest.json から生成 (gen_glyph_list.py)。手で編集しないこと。</p>
<p>各マス: 上 = asteain、下の小さい字 = 一般フォント (游ゴシック等) での同じ文字。</p>
<p>全角形・借用・縦書き変体などの自動生成ぶんは <a href="自動生成対応表.html">自動生成対応表</a> を参照。</p>
{body}
</body></html>
"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"収録 {len(mapped)} 字 + SVGのみ {len(unmapped)} 字 -> {OUT}")


if __name__ == "__main__":
    main()
