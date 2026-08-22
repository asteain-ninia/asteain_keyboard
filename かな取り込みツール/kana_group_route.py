# -*- coding: utf-8 -*-
"""Figma の SVG 書き出し (グループ名 = id 付き) から、かなグリフを切り出す。

  python kana_group_route.py <書き出した.svg> <出力ディレクトリ>

Figma の書き出しパネルで **「Include "id" attribute」を有効にして SVG 書き出し**
したものを渡す。ひらがな・カタカナ・記号を 1 ファイルにまとめて出してよい。

「Copy as SVG」と違って **グループ名が残る** ので、文字の同定は
(セクション名, 行グループ名, 段) の 3 つで引ける = 列の並びに依存しない。
段だけは縦位置から求めるので、ガイドの升目 (高さ64) に載っている必要がある。

Figma は非 ASCII の id を「UTF-8 の各バイトを 1 文字ずつ文字参照」にするので、
読んだあと latin-1 → UTF-8 で戻す (fix_name)。
ガイドは名前に「ガイド」を含むまとまりごと捨て、さらに黒い図形だけを拾う。
"""
import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path as FsPath

from fontTools.misc.transform import Transform
from pathops import PathOp, op

from kana_resolve import CELL_H, CELL_W, SCRIPTS, svg_d
from kana_svg_route import collect_masks, parse_transform, resolve_element

NS = "{http://www.w3.org/2000/svg}"
INK = {"black", "#000000", "#000"}

# 最上位のまとまり → どの文字体系か
CONTAINERS = {"カタカナ": "katakana", "ひらがな": "hiragana", "記号": "symbols"}

# セクション名の揺れを吸収して、対応表の鍵に寄せる
SECTION_ALIAS = {
    "基本カタカナ": "基本カタカナ",
    "基本ひらがな": "基本カタカナ",
    "濁点付き": "濁点付き",
    "ひらがな濁点付き": "濁点付き",
    "小書き": "小書き",
    "ひらがな小書き": "小書き",
}

# 行グループ名の揺れ
ROW_ALIAS = {"う゛": "ゔ", "ウ゛": "ヴ"}

MASKS = {}


def fix_name(name):
    """Figma の id (UTF-8 バイトが 1 文字ずつ文字参照になっている) を元に戻す"""
    if not name:
        return ""
    try:
        return name.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def base_name(el):
    """id から Figma が付ける重複回避の _2 などを外した名前"""
    return fix_name(el.get("id")).rstrip("_0123456789")


def is_ink(el):
    return (el.get("fill") or "").lower() in INK or (el.get("stroke") or "").lower() in INK


def ink_regions(el, tf=None, out=None):
    """要素の下にある黒い図形だけを、解決済みの領域として集める"""
    tf = Transform() if tf is None else tf
    out = [] if out is None else out
    tag = el.tag.split("}")[1]
    if tag in ("mask", "defs", "title", "desc"):
        return out
    if tag == "g":
        inner = tf.transform(parse_transform(el.get("transform"))) if el.get("transform") else tf
        for ch in el:
            ink_regions(ch, inner, out)
        return out
    if not is_ink(el):
        return out
    region = resolve_element(el, MASKS, tf)
    if region is not None and region.bounds != (0.0, 0.0, 0.0, 0.0):
        out.append(region)
    return out


def union(regions):
    total = None
    for r in regions:
        total = r if total is None else op(total, r, PathOp.UNION)
    return total


def merge_by_row(regions, oy):
    """同じ升目行に落ちた図形をまとめる (濁点は基字と同じ行なので自然に合体する)"""
    groups = defaultdict(list)
    for r in regions:
        b = r.bounds
        groups[int(((b[1] + b[3]) / 2 + oy) // CELL_H)].append(r)
    return {row: union(pieces) for row, pieces in groups.items()}


def offsets_from_guide(root):
    """ガイドの升目から原点を厳密に求める。取れなければ None。

    ガイドの各升は 28x26 の四角 2 個で市松になっていて、1 個目が升の左上ちょうど、
    2 個目がそこから (+28, +26) の位置にある。この「+26」の関係は縦だけ一意に効く
    (横は 28 = 56/2 なので両方向に成り立ってしまう) ので、まず縦を決め、
    その行にある四角の x から横を決める。
    """
    sq = [(float(e.get("x", 0)), float(e.get("y", 0)))
          for e in root.iter(NS + "rect")
          if e.get("width") == "28" and e.get("height") == "26"]
    if len(sq) < 8:
        return None
    ys = {int(y) % CELL_H for _, y in sq}
    y0 = next((b for b in ys if (b + 26) % CELL_H in ys and (b - 26) % CELL_H not in ys), None)
    if y0 is None:
        return None
    xs = {int(x) % CELL_W for x, y in sq if int(y) % CELL_H == y0}
    if len(xs) != 1:
        return None
    x0 = xs.pop()
    return int((-x0) % CELL_W), int((-y0) % CELL_H), len(sq)


def find_offsets(all_regions, base_rows):
    """升目の原点を割り出す。

    縦: 図形の下端はベースライン (升目上端 +51) に集まる。
    横: **字ごとに合成してから** 左端を見る (合成前の individual な線は
        左端がばらつくので、そのままだと山がぼやける)。基本セクションだけを使う
        (小書きは升目の右寄せで描かれていて左端が 5 にならないため)。
    """
    bottoms = Counter(round(r.bounds[3]) % CELL_H for r in all_regions)
    oy = int((51 - bottoms.most_common(1)[0][0]) % CELL_H)

    merged = []
    for regs in base_rows:
        merged.extend(merge_by_row(regs, oy).values())
    lefts = Counter(round(g.bounds[0]) % CELL_W for g in merged)
    ox = int((5 - lefts.most_common(1)[0][0]) % CELL_W)
    return ox, oy, bottoms.most_common(1)[0][1], lefts.most_common(1)[0][1], len(merged)


def lookup(script, section, row_name, dan):
    """(文字体系, セクション, 行名, 段) → (ラベル, コードポイント)"""
    tables, _, _, singles = SCRIPTS[script]
    name = ROW_ALIAS.get(row_name, row_name)
    if name in singles:
        # 小書きセクションの「ン」は小書きのンのこと
        if section == "小書き" and name in ("ン", "ん"):
            return singles.get("小ン", (None, None))
        return singles[name]
    table = tables.get(section)
    if not table or name not in table:
        return None, None
    cell = table[name][dan] if 0 <= dan < len(table[name]) else None
    return cell if cell else (None, None)


def main():
    global MASKS
    svg_path, outdir = sys.argv[1], FsPath(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)
    root = ET.parse(svg_path).getroot()
    MASKS = collect_masks(root)

    # ① 最上位のまとまりを拾う (ガイドは名前で捨てる)
    found = {}
    for el in root.iter(NS + "g"):
        name = base_name(el)
        if "ガイド" in name or name not in CONTAINERS:
            continue
        found.setdefault(CONTAINERS[name], el)
    lacking = [k for k in CONTAINERS.values() if k not in found]
    print("まとまり:", " / ".join(sorted(found)) + (f"   ★不足: {lacking}" if lacking else ""))

    # ② 行グループごとに黒い図形を集める
    rows, singles = [], []
    for script, container in found.items():
        if script == "symbols":
            for child in container:
                nm = base_name(child) if child.tag == NS + "g" else fix_name(child.get("id")).rstrip("_0123456789")
                regs = ink_regions(child)
                if nm and regs:
                    singles.append((nm, regs))
            continue
        for section_el in container:
            section = SECTION_ALIAS.get(base_name(section_el))
            if section is None:
                print(f"  !! 知らないセクション「{base_name(section_el)}」は飛ばす")
                continue
            for row_el in section_el:
                rows.append((script, section, base_name(row_el), ink_regions(row_el)))

    all_regions = [r for _, _, _, rs in rows for r in rs] + [r for _, rs in singles for r in rs]
    guide = offsets_from_guide(root)
    if guide:
        ox, oy, nsq = guide
        print(f"図形 {len(all_regions)} 個 / 升目原点 = SVG({-ox}, {-oy})  "
              f"← ガイドの升目 {nsq} 個から厳密に決定")
    else:
        base_rows = [rs for _, sec, _, rs in rows if sec == "基本カタカナ" and rs]
        ox, oy, yhit, xhit, nbase = find_offsets(all_regions, base_rows)
        print(f"図形 {len(all_regions)} 個 / 升目原点 = SVG({-ox}, {-oy})  "
              f"← ガイドが無いので字の位置から推定 (下端一致 {yhit}/{len(all_regions)}、"
              f"左端の山 {xhit}/{nbase})")

    # ③ セクションごとの先頭升目行 (= あ段の行)
    section_top = {}
    for script, section, _, regs in rows:
        for r in regs:
            row = int(((r.bounds[1] + r.bounds[3]) / 2 + oy) // CELL_H)
            key = (script, section)
            section_top[key] = min(section_top.get(key, row), row)
    for (script, section), top in sorted(section_top.items()):
        print(f"  {script}/{section}: 先頭升目行 {top}")

    # ④ 升ごとに書き出す
    manifest, report, seen = [], [], {}

    def emit(total, label, cp, where):
        b = total.bounds
        col = int(((b[0] + b[2]) / 2 + ox) // CELL_W)
        row = int(((b[1] + b[3]) / 2 + oy) // CELL_H)
        tx, ty = ox - col * CELL_W, oy - row * CELL_H
        ink = (b[0] + tx, b[1] + ty, b[2] + tx, b[3] + ty)
        fname = f"{f'u{cp:04X}' if cp else 'unmapped'}_{label}.svg"
        if fname in seen:
            report.append(f"!! {where}: {label} が二重に出てきた (先に {seen[fname]})")
            return
        seen[fname] = where
        (outdir / fname).write_text(
            f'<svg width="{int(CELL_W)}" height="{int(CELL_H)}" viewBox="0 0 {int(CELL_W)} {int(CELL_H)}"'
            f' fill="none" xmlns="http://www.w3.org/2000/svg">\n'
            f'<path d="{svg_d(total, tx, ty)}" fill="black"/>\n'
            f'<rect width="2" height="64" fill="#D9D9D9"/>\n</svg>\n',
            encoding="utf-8",
        )
        manifest.append({"file": fname, "cp": cp, "label": label,
                         "adv": int(CELL_W), "ink": [round(v, 3) for v in ink]})
        over = "  ★升目からはみ出し" if ink[0] < -0.5 or ink[2] > CELL_W + 0.5 else ""
        foot = "" if abs(ink[3] - 51.0) <= 1.5 or label in ("゛", "゜", "・", "ー") else f"  ★底={ink[3]:.1f}"
        report.append(f"{fname}\t{where}\tink x:{ink[0]:.1f}-{ink[2]:.1f} "
                      f"y:{ink[1]:.1f}-{ink[3]:.1f}{foot}{over}")

    for script, section, row_name, regs in rows:
        if not regs:
            continue
        top = section_top[(script, section)]
        name = row_name[3:] if row_name.startswith("小書き") else row_name
        for row, total in sorted(merge_by_row(regs, oy).items()):
            dan = row - top
            label, cp = lookup(script, section, name, dan)
            if label is None:
                report.append(f"!! {script}/{section}/{row_name} 段{dan}: 対応表に無い")
                continue
            emit(total, label, cp, f"{script}/{section}/{row_name}段{dan}")

    for nm, regs in singles:
        label, cp = lookup("katakana", "記号", nm, 0)
        if label is None:
            report.append(f"!! 記号/{nm}: 対応表に無い")
            continue
        emit(union(regs), label, cp, f"記号/{nm}")

    manifest.sort(key=lambda m: (m["cp"] is None, m["cp"] or 0))
    (outdir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    mapped = sum(1 for m in manifest if m["cp"])
    print(f"出力 {len(manifest)} 字 (コードポイントあり {mapped} / なし {len(manifest) - mapped})")
    for line in report:
        print(line)


if __name__ == "__main__":
    main()
