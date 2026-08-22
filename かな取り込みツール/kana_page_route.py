# -*- coding: utf-8 -*-
"""Figma の「Copy as SVG」で貼った 1 枚もののページ SVG からグリフを切り出す。

REST API を一切使わないルート。かなもじページの 3 セクションを全選択して
右クリック →「Copy/Paste as」→「Copy as SVG」したものを .svg として保存し、これに渡す。

  python kana_page_route.py <page.svg> <出力ディレクトリ> [katakana|hiragana]

ひらがなを収録するときは、**カタカナとは別に** Copy as SVG して
第3引数に hiragana を渡す (一緒に選択すると升目の原点が食い違う)。

Copy as SVG はグループ名を落として平坦化するので、文字の同定は
**五十音表の升目の (列, 行)** だけで行う (kana_resolve.py の配置表)。
升目の原点は図形の下端 (=ベースライン 51) と左端 (=5) の分布から自動で割り出す。
"""
import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path as FsPath

from fontTools.misc.transform import Transform
from pathops import PathOp, op

from kana_resolve import CELL_H, CELL_W, SECTION_SPANS, label_for_pos, svg_d
from kana_svg_route import collect_masks, parse_transform, resolve_element


def shapes_of(svg_path):
    """ページ SVG の全図形を、解決済みの領域として集める"""
    root = ET.parse(svg_path).getroot()
    masks = collect_masks(root)
    out = []

    def walk(el, tf):
        tag = el.tag.split("}")[1]
        if tag in ("mask", "defs", "title", "desc"):
            return
        if tag == "g":
            inner = tf.transform(parse_transform(el.get("transform"))) if el.get("transform") else tf
            for ch in el:
                walk(ch, inner)
            return
        region = resolve_element(el, masks, tf)
        if region is not None and region.bounds != (0.0, 0.0, 0.0, 0.0):
            out.append(region)

    for el in root:
        walk(el, Transform())
    return out


def merge_cells(shapes, ox, oy):
    groups = defaultdict(list)
    for s in shapes:
        b = s.bounds
        cx, cy = (b[0] + b[2]) / 2 + ox, (b[1] + b[3]) / 2 + oy
        groups[(int(cx // CELL_W), int(cy // CELL_H))].append(s)
    out = {}
    for key, pieces in groups.items():
        total = None
        for p in pieces:
            total = p if total is None else op(total, p, PathOp.UNION)
        out[key] = total
    return out


def find_offset(shapes):
    """升目の原点を割り出す。下端はベースライン 51、左端は 5 に集まるはず。"""
    prov = merge_cells(shapes, 2, 2)  # ±2 のずれでは升の割り当ては変わらない
    bottoms = Counter(round(g.bounds[3]) % CELL_H for g in prov.values())
    lefts = Counter(round(g.bounds[0]) % CELL_W for g in prov.values())
    oy = (51 - bottoms.most_common(1)[0][0]) % CELL_H
    ox = (5 - lefts.most_common(1)[0][0]) % CELL_W
    return int(ox), int(oy), bottoms.most_common(1)[0][1], len(prov)


def detect_sections(cells):
    """字の入っている升目行のかたまりを探し、上から順にセクションとみなす。

    セクションの間は必ず 1 行以上あくので、連続した行の並び = 1 セクション。
    位置を決め打ちしないので、Figma 側でセクションを上下に動かしても追従する。
    戻り値: {升目行: (セクション名, そのセクションの先頭行)}
    """
    rows = sorted({r for _, r in cells})
    runs, start, prev = [], rows[0], rows[0]
    for r in rows[1:]:
        if r == prev + 1:
            prev = r
        else:
            runs.append((start, prev))
            start = prev = r
    runs.append((start, prev))

    names = [name for name, _ in SECTION_SPANS]  # 基本 → 濁点付き → 小書き の順
    row_map = {}
    for i, (lo, hi) in enumerate(runs):
        name = names[i] if i < len(names) else f"不明{i + 1}"
        note = "" if hi - lo == 4 else f"  ★5段ではなく{hi - lo + 1}段"
        print(f"  セクション{i + 1}: 升目行 {lo}〜{hi} → 「{name}」{note}")
        for r in range(lo, hi + 1):
            row_map[r] = (name, lo)
    return row_map


def main():
    page_svg, outdir = sys.argv[1], FsPath(sys.argv[2])
    script = sys.argv[3] if len(sys.argv) > 3 else "katakana"
    outdir.mkdir(parents=True, exist_ok=True)

    shapes = shapes_of(page_svg)
    ox, oy, hit, ncell = find_offset(shapes)
    print(f"図形 {len(shapes)} 個 / 升目原点 = SVG({-ox}, {-oy})  "
          f"(ベースライン一致 {hit}/{ncell} 升)")

    cells = merge_cells(shapes, ox, oy)
    row_map = detect_sections(cells)
    report, manifest = [], []
    for (col, row) in sorted(cells, key=lambda k: (k[1], k[0])):
        total = cells[(col, row)]
        section, base = row_map[row]
        label, cp = label_for_pos(section, col, row - base, script)
        if label is None:
            report.append(f"!! {section} 列{col} 段{row - base}: 配置表に無い升 (bbox={total.bounds})")
            continue
        b = total.bounds
        tx = ox - col * CELL_W
        ty = oy - row * CELL_H
        d = svg_d(total, tx, ty)
        ink = (b[0] + tx, b[1] + ty, b[2] + tx, b[3] + ty)
        cpname = f"u{cp:04X}" if cp else "unmapped"
        fname = f"{cpname}_{label}.svg"
        (outdir / fname).write_text(
            f'<svg width="{int(CELL_W)}" height="{int(CELL_H)}" viewBox="0 0 {int(CELL_W)} {int(CELL_H)}"'
            f' fill="none" xmlns="http://www.w3.org/2000/svg">\n'
            f'<path d="{d}" fill="black"/>\n'
            f'<rect width="2" height="64" fill="#D9D9D9"/>\n</svg>\n',
            encoding="utf-8",
        )
        manifest.append({"file": fname, "cp": cp, "label": label,
                         "adv": int(CELL_W), "ink": [round(v, 3) for v in ink]})
        over = "  ★升目からはみ出し" if ink[0] < -0.5 or ink[2] > CELL_W + 0.5 else ""
        foot = "" if abs(ink[3] - 51.0) <= 1.5 or label in ("゛", "゜", "・", "ー") else f"  ★底={ink[3]:.1f}"
        report.append(f"{fname}\t列{col} 行{row}\tink x:{ink[0]:.1f}-{ink[2]:.1f} y:{ink[1]:.1f}-{ink[3]:.1f}{foot}{over}")

    manifest.sort(key=lambda m: (m["cp"] is None, m["cp"] or 0))
    (outdir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    mapped = sum(1 for m in manifest if m["cp"])
    print(f"升 {len(cells)} / 出力 {len(manifest)} (コードポイントあり {mapped} / なし {len(manifest)-mapped})")
    for line in report:
        print(line)


if __name__ == "__main__":
    main()
