# -*- coding: utf-8 -*-
"""画像エクスポート経由ルート: 行グループの SVG をダウンロード → マスク解決 →
グリフ単位に分割 → セル正規化 SVG + manifest.json を出力する。

usage: python kana_svg_route.py <rows_urls.json> <kana_page.json> <outdir>

- rows_urls.json : /v1/images の応答 ({images: {id: url}})
- kana_page.json : かなもじページ depth=1 の応答 (各グループの absoluteBoundingBox 用)
- グリフ単位: SVG 直下の <g> は 1 グリフ。直下の裸 rect/path は解決後にセル中心で束ねる。
"""
import json
import math
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path as FsPath

from pathops import LineCap, LineJoin, Path, PathOp, op
from fontTools.svgLib.path import parse_path
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

from kana_resolve import (
    GRID_X, GRID_Y, CELL_W, CELL_H,
    cell_of, label_for, svg_d, union_all,
)

SVGNS = "{http://www.w3.org/2000/svg}"


def parse_transform(s):
    """SVG transform 属性 (matrix/translate/rotate/scale の並び) を Transform に"""
    total = Transform()
    if not s:
        return total
    for func, args in re.findall(r"(\w+)\(([^)]*)\)", s):
        v = [float(x) for x in re.split(r"[ ,]+", args.strip()) if x]
        if func == "matrix":
            t = Transform(*v)
        elif func == "translate":
            t = Transform(1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0.0)
        elif func == "scale":
            sx = v[0]
            sy = v[1] if len(v) > 1 else sx
            t = Transform(sx, 0, 0, sy, 0, 0)
        elif func == "rotate":
            rad = math.radians(v[0])
            if len(v) == 3:
                t = Transform().translate(v[1], v[2]).rotate(rad).translate(-v[1], -v[2])
            else:
                t = Transform().rotate(rad)
        else:
            raise ValueError(f"未対応の transform: {func}({args})")
        total = total.transform(t)
    return total


def d_to_path(d, tf):
    p = Path()
    pen = TransformPen(p.getPen(), tf)
    parse_path(d, pen)
    p.simplify()
    return p


def rrect_d(x, y, w, h, rx):
    """角丸矩形の d 文字列 (rx=0 なら普通の矩形)"""
    rx = min(rx, w / 2, h / 2)
    if rx <= 0:
        return f"M{x} {y}L{x + w} {y}L{x + w} {y + h}L{x} {y + h}Z"
    return (
        f"M{x + rx} {y}H{x + w - rx}A{rx} {rx} 0 0 1 {x + w} {y + rx}"
        f"V{y + h - rx}A{rx} {rx} 0 0 1 {x + w - rx} {y + h}"
        f"H{x + rx}A{rx} {rx} 0 0 1 {x} {y + h - rx}"
        f"V{y + rx}A{rx} {rx} 0 0 1 {x + rx} {y}Z"
    )


def rect_to_path(el, tf):
    """マスク内容用: 単純な塗り領域として扱う"""
    x = float(el.get("x", 0))
    y = float(el.get("y", 0))
    w = float(el.get("width"))
    h = float(el.get("height"))
    return d_to_path(rrect_d(x, y, w, h, float(el.get("rx", 0))), tf)


def rect_region(el):
    """描画要素としての rect: fill / stroke (中心線) を解釈した領域 (ローカル座標)。

    ルート svg が fill="none" を継承させるため、fill は明示属性があるときだけ塗る。
    stroke は中心線ストローク: 外側角丸矩形 − 内側角丸矩形 のリング。
    """
    x = float(el.get("x", 0))
    y = float(el.get("y", 0))
    w = float(el.get("width"))
    h = float(el.get("height"))
    rx = float(el.get("rx", el.get("ry", 0)))
    fill = el.get("fill")
    stroke = el.get("stroke")
    region = None
    if fill and fill != "none":
        region = d_to_path(rrect_d(x, y, w, h, rx), Transform())
    if stroke and stroke != "none":
        sw = float(el.get("stroke-width", 1))
        outer = d_to_path(rrect_d(x - sw / 2, y - sw / 2, w + sw, h + sw, rx + sw / 2 if rx > 0 else 0), Transform())
        iw, ih = w - sw, h - sw
        if iw > 0 and ih > 0:
            inner = d_to_path(rrect_d(x + sw / 2, y + sw / 2, iw, ih, max(rx - sw / 2, 0)), Transform())
            ring = op(outer, inner, PathOp.DIFFERENCE)
        else:
            ring = outer
        region = ring if region is None else op(region, ring, PathOp.UNION)
    return region


CAPS = {"butt": LineCap.BUTT_CAP, "round": LineCap.ROUND_CAP, "square": LineCap.SQUARE_CAP}
JOINS = {"miter": LineJoin.MITER_JOIN, "round": LineJoin.ROUND_JOIN, "bevel": LineJoin.BEVEL_JOIN}


def path_region(el):
    """描画要素としての path: fill と stroke を解釈した領域 (ローカル座標)。

    **線 (stroke) は塗りではない。** Figma はループのある字を
    `<path stroke="black" stroke-width="5">` の中心線として書き出すことがあり、
    これを塗りとして扱うと輪の内側まで埋まってしまう (実際に踏んだ)。
    端点・角の形は SVG の既定 (butt / miter) に従う。Figma は
    stroke-linecap/linejoin を書き出さないので、既定がそのまま効く。
    """
    d = el.get("d")
    if not d:
        return None
    fill = (el.get("fill") or "").lower()
    stroke = (el.get("stroke") or "").lower()
    region = None
    if stroke and stroke != "none":
        p = Path()
        parse_path(d, p.getPen())
        p.stroke(
            float(el.get("stroke-width", 1)),
            CAPS.get((el.get("stroke-linecap") or "butt").lower(), LineCap.BUTT_CAP),
            JOINS.get((el.get("stroke-linejoin") or "miter").lower(), LineJoin.MITER_JOIN),
            float(el.get("stroke-miterlimit", 4)),
        )
        p.convertConicsToQuads()  # stroke() が出す CONIC は simplify が扱えない
        p.simplify()
        region = p
    # fill 指定が無く stroke も無い要素は、従来どおり塗りとして扱う (親からの継承対策)
    if (fill and fill != "none") or (not fill and not stroke):
        filled = d_to_path(d, Transform())
        region = filled if region is None else op(region, filled, PathOp.UNION)
    return region


def collect_masks(root):
    masks = {}
    for m in root.iter(f"{SVGNS}mask"):
        shape = None
        for child in m:
            tag = child.tag.split("}")[1]
            piece = rect_to_path(child, Transform()) if tag == "rect" else d_to_path(child.get("d"), Transform())
            shape = piece if shape is None else op(shape, piece, PathOp.UNION)
        masks[m.get("id")] = shape
    return masks


def apply_tf(path, tf):
    out = Path()
    path.draw(TransformPen(out.getPen(), tf))
    return out


def bbox_gap(b1, b2):
    dx = max(b1[0] - b2[2], b2[0] - b1[2], 0.0)
    dy = max(b1[1] - b2[3], b2[1] - b1[3], 0.0)
    return math.hypot(dx, dy)


def resolve_element(el, masks, tf):
    """rect/path/g を解決済み領域 (union) にする。mask/defs は None。

    マスク交差は必ず「生のローカル座標」で行い、その後に tf を適用する
    (マスク形状はファイルローカル座標で収集されているため)。
    """
    tag = el.tag.split("}")[1]
    tf = tf.transform(parse_transform(el.get("transform"))) if el.get("transform") else tf
    if tag in ("mask", "defs", "clipPath", "title", "desc"):
        return None
    if tag == "g":
        pieces = [resolve_element(ch, masks, tf) for ch in el]
        pieces = [p for p in pieces if p is not None]
        return union_all(pieces) if pieces else None
    if tag == "rect":
        piece = rect_region(el)
        if piece is None:
            return None
    elif tag == "path":
        piece = path_region(el)
        if piece is None:
            return None
    else:
        return None
    mref = el.get("mask")
    if mref:
        mid = re.match(r"url\(#(.+)\)", mref).group(1)
        piece = op(piece, masks[mid], PathOp.INTERSECTION)
    return apply_tf(piece, tf)


def emit_units(el, masks, tf, g_units, loose):
    """描画要素を「グリフ 1 字ぶんの単位」として取り出す。

    1 セル (56x64) に対して明らかに大きい <g> は、複数字を束ねた入れ物
    (行ごとコンポーネント化したときの行インスタンス等) とみなして中に降りる。
    はみ出した濁点で多少 bbox が伸びる程度では降りないよう、しきい値は 1.5 セル。
    """
    tag = el.tag.split("}")[1]
    if tag in ("mask", "defs", "title", "desc"):
        return
    region = resolve_element(el, masks, tf)
    if region is None or region.bounds == (0.0, 0.0, 0.0, 0.0):
        return
    b = region.bounds
    oversized = (b[2] - b[0]) > CELL_W * 1.5 or (b[3] - b[1]) > CELL_H * 1.5
    if tag == "g" and oversized and any(ch.tag.split("}")[1] == "g" for ch in el):
        inner = tf.transform(parse_transform(el.get("transform"))) if el.get("transform") else tf
        for ch in el:
            emit_units(ch, masks, inner, g_units, loose)
        return
    (g_units if tag == "g" else loose).append(region)


def main():
    urls_file, rows_file, outdir = sys.argv[1], sys.argv[2], FsPath(sys.argv[3])
    outdir.mkdir(parents=True, exist_ok=True)
    rows_dir = outdir / "_rows"
    rows_dir.mkdir(exist_ok=True)

    urls = json.loads(FsPath(urls_file).read_text(encoding="utf-8"))["images"]
    rows = {r["id"]: r for r in json.loads(FsPath(rows_file).read_text(encoding="utf-8"))["rows"]}

    # 単位を (行ノード, 段) ごとにまとめる。列は使わないので、濁点が升目から
    # 右にはみ出しても隣の字に化けない。
    cells = {}
    n_units = 0
    for nid, url in urls.items():
        meta = rows.get(nid)
        if meta is None:
            print(f"!! {nid}: rows.json に無い行 (構造が変わった?)")
            continue
        if not url:
            print(f"!! {nid} ({meta['name']}): レンダリング失敗")
            continue
        svg_path = rows_dir / (nid.replace(":", "-") + ".svg")
        if not svg_path.exists():
            urllib.request.urlretrieve(url, svg_path)
        root = ET.parse(svg_path).getroot()
        masks = collect_masks(root)
        origin = meta["absoluteBoundingBox"]
        base_tf = Transform(1, 0, 0, 1, origin["x"], origin["y"])

        # 書き出しノード自身のラッパー <g> を 1 段はがして、その子を単位にする
        units_parent = root
        gs = [ch for ch in root if ch.tag.split("}")[1] == "g"]
        rest = [ch for ch in root if ch.tag.split("}")[1] not in ("g", "mask", "defs", "title", "desc")]
        if len(gs) == 1 and not rest:
            units_parent = gs[0]

        units = []
        for el in units_parent:
            emit_units(el, masks, base_tf, units, units)
        n_units += len(units)
        for region in units:
            key = (nid, cell_of(region.bounds)[1])  # (行ノード, 升目の行)
            cells[key] = region if key not in cells else op(cells[key], region, PathOp.UNION)

    report = []
    manifest = []
    for (nid, cell_row), total in cells.items():
        meta = rows[nid]
        b = total.bounds
        dan = cell_row - meta["sectionBaseRow"]
        label, cp = label_for(meta["section"], meta["name"], dan)
        if label is None:
            report.append(f"!! {meta['section']}/{meta['name']} 段{dan} … 対応表に無い (bbox={b})")
            continue
        col = cell_of(b)[0]
        ox = GRID_X + col * CELL_W
        oy = GRID_Y + cell_row * CELL_H
        # SVG は「図面の記録」なので升目 (56x64) にそのまま切り出す。
        # 字送りと左右ベアリングは kana_import.py 側の規則 (家風 = インク幅+5) で決める。
        adv = CELL_W
        tx = -ox
        d = svg_d(total, tx, -oy)
        ink = (b[0] + tx, b[1] - oy, b[2] + tx, b[3] - oy)
        cpname = f"u{cp:04X}" if cp else "unmapped"
        fname = f"{cpname}_{label}.svg"
        svg = (
            f'<svg width="{adv}" height="64" viewBox="0 0 {adv} 64" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
            f'<path d="{d}" fill="black"/>\n'
            f'<rect width="2" height="64" fill="#D9D9D9"/>\n'
            f"</svg>\n"
        )
        (outdir / fname).write_text(svg, encoding="utf-8")
        manifest.append({"file": fname, "cp": cp, "label": label, "adv": adv, "ink": [round(v, 3) for v in ink]})
        bottom = ink[3]
        flag = "" if abs(bottom - 51.0) <= 1.5 or label in ("゛", "゜") else f" ★底={bottom:.1f}"
        over = " ★升目からはみ出し" if ink[0] < -0.5 or ink[2] > CELL_W + 0.5 else ""
        report.append(
            f"{fname}\t{meta['section']}/{meta['name']}段{dan}\t"
            f"ink x:{ink[0]:.1f}-{ink[2]:.1f} y:{ink[1]:.1f}-{ink[3]:.1f}{flag}{over}"
        )

    manifest.sort(key=lambda m: (m["cp"] is None, m["cp"] or 0))
    (outdir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"単位: {n_units} / 合成後グリフ: {len(cells)} / 出力: {len(manifest)}")
    for line in sorted(report):
        print(line)


if __name__ == "__main__":
    main()
