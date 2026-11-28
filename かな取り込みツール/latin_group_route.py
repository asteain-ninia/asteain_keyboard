# -*- coding: utf-8 -*-
"""Figma の SVG 書き出し (id 付き) から、ラテン文字ページのグリフを切り出す。

  python latin_group_route.py <書き出した.svg> <出力ディレクトリ>            … 拡張の升の字すべて
  python latin_group_route.py <書き出した.svg> <出力ディレクトリ> A g …      … ASCII の段の、挙げた字だけ

かな (kana_group_route.py) と違い、**字の同定にレイヤー名を使わない**。
黒い図形を 1 個ずつ「中心が載っている升」に割り当て、升ごとに合成する。
字のグループが崩れていても、名前が仮のままでも、升に載っていれば拾える。

升がどの字かは、ガイドから決める。
  拡張の升 … 升の名前が `À U+C0` のように「字と符号位置」になっている。
  ASCII の段 … 升に字の名前が無いので、段の名前 (大文字・小文字・数字・記号1・記号2) と
               左からの順番で決める (ASCII_ROWS)。

ASCII は字を挙げたときだけ、挙げた字だけを出す。ASCII の字は左右のベアリングを
手で調整してあり、取り込むと家風の一律 2.5 に戻るので、描き直した字だけを選んで入れる。

升は 56×64 で、縦は 128 刻み (升の上にお手本の段が挟まる)。ベースラインより
下へ出る部分 (ç・þ・ý など) は升の下にはみ出すので、升の上端から 96 までを
その升の縦の帯として扱う。
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path as FsPath

import kana_group_route as kg
from kana_resolve import CELL_H, CELL_W, svg_d
from kana_svg_route import collect_masks

NS = "{http://www.w3.org/2000/svg}"
# 末尾の _2 などは Figma が付ける重複回避の番号。kana_group_route.base_name は
# 末尾の数字をまとめて削るので、符号位置や「記号2」の数字まで欠ける。ここでは使わない。
DEDUP_SUFFIX = re.compile(r"_\d+$")
CELL_NAME = re.compile(r"^(.+) U\+([0-9A-Fa-f]{2,6})$")
BAND_BOTTOM = 96  # 升の上端からここまでを、その升の縦の帯とする

# ASCII の段: ガイドの段の名前 → 左から順の字。記号2 の 2 升目は ¥ の形で、U+005C に入る。
ASCII_ROWS = {
    "大文字": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "小文字": "abcdefghijklmnopqrstuvwxyz",
    "数字": "0123456789",
    "記号1": "!\"#$%&'()*+,-.:;<=>?/@",
    "記号2": "[\\]^_`{|}~×\U0001f6ab",
}


def layer_name(el):
    return DEDUP_SUFFIX.sub("", kg.fix_name(el.get("id")))


def frame_of(el):
    """升の枠 (高さ 64 の四角) の左上。枠を持たなければ None。

    枠の幅は段によって違う (小文字の段は 40) が、升の刻みはどの段も 56 なので、
    幅は見ない。
    """
    for r in el.iter(NS + "rect"):
        if float(r.get("height")) == CELL_H:
            return float(r.get("x", 0)), float(r.get("y", 0))
    return None


def named_cells(root):
    """升名 `字 U+XXXX` を持つガイドの升 → [(符号位置, 字, 升の左上 x, y)]"""
    cells = []
    for el in root.iter(NS + "g"):
        m = CELL_NAME.match(layer_name(el))
        if not m:
            continue
        frame = frame_of(el)
        if frame is not None:
            cells.append((ord(m.group(1)), m.group(1), frame[0], frame[1]))
            if ord(m.group(1)) != int(m.group(2), 16):
                print(f"!! 升名「{layer_name(el)}」の字と符号位置が合わない (字のほうを採る)")
    return cells


def ascii_cells(root):
    """ASCII の段の升 → [(符号位置, 字, 升の左上 x, y)]。段の名前と左からの順番で決める"""
    cells = []
    for el in root.iter(NS + "g"):
        chars = ASCII_ROWS.get(layer_name(el))
        if chars is None:
            continue
        frames = []
        for child in el:
            frame = frame_of(child)
            if frame is not None:
                frames.append(frame)
        if not frames:
            continue  # 同じ名前の、字のほうのグループ (枠を持たない)
        if len(frames) != len(chars):
            print(f"!! ガイド「{layer_name(el)}」の升が {len(frames)} 個 (期待 {len(chars)} 個)。飛ばす")
            continue
        for ch, (x, y) in zip(chars, sorted(frames)):
            cells.append((ord(ch), ch, x, y))
    return cells


def cell_at(cells, x, y):
    for cell in cells:
        _, _, cx, cy = cell
        if cx <= x < cx + CELL_W and cy <= y < cy + BAND_BOTTOM:
            return cell
    return None


def main():
    svg_path, outdir, wanted = sys.argv[1], FsPath(sys.argv[2]), sys.argv[3:]
    outdir.mkdir(parents=True, exist_ok=True)
    root = ET.parse(svg_path).getroot()
    kg.MASKS = collect_masks(root)

    if wanted:
        cells = [c for c in ascii_cells(root) if c[1] in wanted]
        for ch in wanted:
            if ch not in [c[1] for c in cells]:
                print(f"!! 「{ch}」の升が ASCII の段に見つからない")
    else:
        cells = named_cells(root)

    tops = [c for c in root if c.tag == NS + "g"]
    if len(tops) == 1:
        tops = list(tops[0])  # 書き出しの最上位 (Group 2 など) を 1 段はがす

    pieces = defaultdict(list)
    outside = 0
    for el in tops:
        name = layer_name(el)
        if "ガイド" in name or name == "文字配列":
            continue
        for region in kg.ink_regions(el):
            b = region.bounds
            cell = cell_at(cells, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            if cell is None:
                outside += 1
                continue
            pieces[cell].append(region)
    print(f"升 {len(cells)} 個 / 升に載った図形 {sum(len(v) for v in pieces.values())} 個 / "
          f"対象の升の外の図形 {outside} 個 (拾わない)")

    manifest, report = [], []
    for cell in sorted(cells):
        cp, label, cx, cy = cell
        if cell not in pieces:
            report.append(f"!! U+{cp:04X} {label}: 升が空 (未描画)")
            continue
        total = kg.union(pieces[cell])
        b = total.bounds
        ink = (b[0] - cx, b[1] - cy, b[2] - cx, b[3] - cy)
        fname = f"u{cp:04X}.svg"
        if label.isalnum():
            fname = f"u{cp:04X}_{label}.svg"  # 記号はファイル名に使えない字があるので付けない
        (outdir / fname).write_text(
            f'<svg width="{int(CELL_W)}" height="{int(CELL_H)}" viewBox="0 0 {int(CELL_W)} {int(CELL_H)}"'
            f' fill="none" xmlns="http://www.w3.org/2000/svg">\n'
            f'<path d="{svg_d(total, -cx, -cy)}" fill="black"/>\n'
            f'<rect width="2" height="64" fill="#D9D9D9"/>\n</svg>\n',
            encoding="utf-8",
        )
        manifest.append({"file": fname, "cp": cp, "label": label,
                         "adv": int(CELL_W), "ink": [round(v, 3) for v in ink]})
        over = ""
        if ink[0] < -0.5 or ink[2] > CELL_W + 0.5:
            over = "  ★升目からはみ出し"
        report.append(f"{fname}\t図形{len(pieces[cell])}個\tink x:{ink[0]:.1f}-{ink[2]:.1f} "
                      f"y:{ink[1]:.1f}-{ink[3]:.1f}{over}")

    (outdir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"出力 {len(manifest)} 字")
    for line in report:
        print(line)


if __name__ == "__main__":
    main()
