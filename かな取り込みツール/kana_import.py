# -*- coding: utf-8 -*-
"""ffpython で実行。カタカナ SVG 群を asteain フォント (のコピー) に取り込む。

usage: ffpython kana_import.py <in.sfd> <svg_dir> <out_dir>

座標系: SVG 64 単位 = em2048 (×32)、SVG y=0 → フォント y=+1638 (Ascent)。
既存グリフと同じ「ベースライン +6」の載り方に合わせる。
1 グリフ目で FontForge の SVG 取り込みスケールを実測し、校正行列を全グリフに適用する。
"""
import json
import os
import re
import sys

import fontforge
import psMat

ASCENT = 1638
SCALE = 32.0
KANA_WIDTH = 56 * 32  # 全角固定 1792
EM = 2048


def expected_bbox(ink):
    x0, y0, x1, y1 = ink  # SVG 座標 (y 下向き)
    return (x0 * SCALE, ASCENT - y1 * SCALE, x1 * SCALE, ASCENT - y0 * SCALE)


# 結合用の濁点・半濁点。単独版 (U+309B/309C) の輪郭をそのまま使う。
COMBINING = {0x3099: 0x309B, 0x309A: 0x309C}


def make_combining_marks(font, done=()):
    """U+3099 / U+309A を、単独版から「送り幅 0 で直前の字に重なる」グリフとして作る。

    横位置は、実際に描かれた合成字から逆算した:
      ガ の濁点の右端 50 = カ のインク右端 50、ギ 51 = キ 51 … と**揃っている**。
    家風では インク右端 = 送り幅 − 2.5 なので、直前の字の送り終わり (= 原点) から
    左に 2.5 単位のところへ右端を置けば、同じ位置に重なる。
    縦位置は単独版のまま (升目上端から 1〜14)。
    """
    for cp, src_cp in COMBINING.items():
        if cp in done:
            print("結合用 U+%04X: 図面から取り込み済みなので自動生成しない" % cp)
            continue
        try:
            src = font[src_cp]
        except TypeError:
            print("結合用 U+%04X: 元になる U+%04X が無いので飛ばす" % (cp, src_cp))
            continue
        g = font.createChar(cp)
        g.clear()
        g.addReference(src.glyphname)
        g.unlinkRef()
        b = g.boundingBox()
        g.transform(psMat.translate(-2.5 * SCALE - b[2], 0))
        g.round()
        g.width = 0
        g.vwidth = EM
        try:
            g.glyphclass = "mark"  # 組版側に「これは合成用の印」と伝える
        except Exception:
            pass
        nb = g.boundingBox()
        print("結合用 U+%04X ← U+%04X  送り0  ink x %.1f〜%.1f (単位)"
              % (cp, src_cp, nb[0] / SCALE, nb[2] / SCALE))


def make_ideographic_space(font, done=()):
    """全角スペース (U+3000) を作る。輪郭は無く、送り幅だけのグリフ。

    幅は **升目 1 つぶん = 56 単位**。このフォントの「全角」は五十音ガイドの
    升目 (56×64) が定義しているので、かな 1 字ぶんの空きになる。
    (Unicode の定義どおり 1em = 64 単位にしたい場合は KANA_WIDTH を EM に変える。)
    """
    if 0x3000 in done:
        print("全角スペース U+3000: 図面から取り込み済みなので自動生成しない")
        return
    g = font.createChar(0x3000)
    g.clear()
    g.width = KANA_WIDTH
    g.vwidth = EM
    print("全角スペース U+3000 を生成  送り %.0f 単位 (輪郭なし)" % (KANA_WIDTH / SCALE))


def make_fullwidth_forms(font, done=()):
    """全角形 (U+FF01〜FF5E) を ASCII (U+0021〜007E) から作る。

    **字形は参照 (リファレンス) で共有する。** 実体は ASCII 側の 1 つだけなので、
    あとで `(` を描き直せば `（` も自動で追従するし、ファイルも太らない。
    やることは「送り幅を全角 (升目 1 つぶん) にして、インクを中央に置く」だけ。

    普通の日本語フォントは全角形を別に描くが、それは**ラテンとかなで寸法系が
    違うから**の対処。このフォントは実測でラテンの括弧もかなと同じ縦の帯
    (y 1〜51) に載っているので、その必要がない。
    """
    made, skipped = 0, []
    for cp in range(0x21, 0x7F):
        full = cp + 0xFEE0  # ASCII → 全角形 のオフセット
        if full in done:
            skipped.append(full)
            continue
        try:
            src = font[cp]
        except TypeError:
            continue
        if src.isWorthOutputting() is False:
            continue
        b = src.boundingBox()
        if b[2] <= b[0]:
            continue
        g = font.createChar(full)
        g.clear()
        dx = (KANA_WIDTH - (b[2] - b[0])) / 2 - b[0]
        g.addReference(src.glyphname, psMat.translate(round(dx), 0))
        g.width = KANA_WIDTH
        g.vwidth = EM
        made += 1
    print("全角形 U+FF01〜FF5E を %d 字生成 (ASCII への参照・送り %.0f 単位)"
          % (made, KANA_WIDTH / SCALE))
    if skipped:
        print("  ただし %s は図面から取り込み済みなので自動生成しない"
              % " ".join("U+%04X" % c for c in skipped))


def make_tofu(font, done=()):
    """豆腐 □ (U+25A1) を家風で作り、.notdef にも同じものを入れる。

    収録サンプルは未収録の升に □ を出すが、フォント側に無いと代替フォントが
    描くことになり、**その升だけ行の高さが変わって**枠がガタつく。
    自前で持てば全部 asteain の寸法で揃う。

    形は家風どおり「幅 5 のモノラインの枠」。大きさはかなに合わせて
    インク 45×50 単位、ベースライン (+6) に載せる。
    """
    if 0x25A1 in done:
        print("豆腐 U+25A1: 図面から取り込み済みなので自動生成しない")
        return
    w, h, sw = 45 * SCALE, 50 * SCALE, 5 * SCALE
    y0 = 6  # 既存グリフと同じベースラインの載り方

    def draw(g):
        g.clear()
        pen = g.glyphPen()
        for x0, yy0, x1, yy1 in ((0, y0, w, y0 + h),
                                 (sw, y0 + sw, w - sw, y0 + h - sw)):
            pen.moveTo((x0, yy0))
            pen.lineTo((x1, yy0))
            pen.lineTo((x1, yy1))
            pen.lineTo((x0, yy1))
            pen.closePath()
        pen = None
        g.correctDirection()  # 内側の枠を穴として認識させる
        g.transform(psMat.translate(2.5 * SCALE, 0))  # 家風の左ベアリング
        g.round()
        g.width = int(w + sw)
        g.vwidth = EM

    draw(font.createChar(0x25A1))
    try:
        draw(font[".notdef"])
    except TypeError:
        draw(font.createChar(-1, ".notdef"))
    print("豆腐 U+25A1 と .notdef を生成  送り %.0f 単位" % ((w + sw) / SCALE))


# 形が同じなので他の字から借りる字。
#   〈〉 … デーレ文字の U+F2F8B / U+F2F8C が同形
#   ゠   … 二重ハイフン。ASCII の = と同形
BORROWED = {0x3008: 0xF2F8B, 0x3009: 0xF2F8C, 0x30A0: 0x003D}


def make_borrowed_glyphs(font, done=()):
    """既にある同形のグリフを参照して作る。

    字送りも借り元のまま使う。借り元は家風 (送り = インク幅 + 5) で作られているので、
    そのまま持ってくれば規則も揃う。借り元を描き直せばこちらも追従する。
    """
    for cp, src_cp in BORROWED.items():
        if cp in done:
            print("借用 U+%04X: 図面から取り込み済みなので自動生成しない" % cp)
            continue
        try:
            src = font[src_cp]
        except TypeError:
            print("借用 U+%04X: 借り元 U+%05X が無いので飛ばす" % (cp, src_cp))
            continue
        g = font.createChar(cp)
        g.clear()
        g.addReference(src.glyphname)
        g.width = src.width
        g.vwidth = EM
        print("借用 U+%04X ← U+%05X (%s) 送り %.1f 単位"
              % (cp, src_cp, src.glyphname, src.width / SCALE))

def write_coverage_js(font, out_dir):
    """収録コードポイントの一覧を font_coverage.js に書き出す。

    index.html は本来 asteain.woff の cmap を直接読んで「未収録」を判定するが、
    **file:// で開くと fetch が使えず判定ごと無効になる** (豆腐も灰色も出ない)。
    そのときの控えとしてこれを読む。<script src> なら file:// でも読めるため。
    連続するコードポイントは範囲にまとめて小さくする。
    """
    cps = set()
    for g in font.glyphs():
        if g.unicode and g.unicode > 0:
            cps.add(g.unicode)
        for alt in (g.altuni or ()):
            if alt[0] > 0:
                cps.add(alt[0])
    ranges = []
    for cp in sorted(cps):
        if ranges and cp == ranges[-1][1] + 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp])
    head = [
        "// asteain の収録コードポイント一覧。かな取り込みツール/kana_import.py が自動生成。",
        "// index.html は普段 asteain.woff の cmap を直接読むが、file:// で開くと",
        "// fetch が使えないので、そのときだけこれを使う。手で編集しないこと。",
        "window.ASTEAIN_COVERAGE = [%s];" % ",".join("[%d,%d]" % (a, b) for a, b in ranges),
        "",
    ]
    path = os.path.join(out_dir, "font_coverage.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write(chr(10).join(head))
    print("font_coverage.js を生成  %d 字 / %d 範囲" % (len(cps), len(ranges)))

def main():
    sfd_in, svg_dir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    basename = sys.argv[4] if len(sys.argv) > 4 else "test_asteain"
    # 字送りの決め方:
    #   family    … 送り幅 = インク幅 + 5 (左右2.5ずつ)。既存6書体と同じ規則。
    #   fullwidth … 送り幅 = 全角56、インクを升目の中央に置く。日本語の等幅慣例。
    #   asis      … manifest の adv をそのまま使い、横位置も図面のまま。
    mode = sys.argv[5] if len(sys.argv) > 5 else "asis"
    with open(os.path.join(svg_dir, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)

    font = fontforge.open(sfd_in)
    if "full" not in font.encoding.lower():
        font.encoding = "UnicodeFull"
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, "_tmp_nomarker.svg")

    correction = None
    imported = 0
    done = set()  # 図面から取り込んだ字 (自動生成で上書きしないため)
    for item in manifest:
        if not item.get("cp"):
            continue
        with open(os.path.join(svg_dir, item["file"]), encoding="utf-8") as f:
            svg = f.read()
        svg = re.sub(r'<rect width="2" height="64"[^/]*/>\s*', "", svg)  # マーカーバー除去
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(svg)

        g = font.createChar(item["cp"])
        g.clear()
        g.importOutlines(tmp)
        exp = expected_bbox(item["ink"])
        if correction is None:
            m = g.boundingBox()
            sx = (exp[2] - exp[0]) / (m[2] - m[0])
            sy = (exp[3] - exp[1]) / (m[3] - m[1])
            correction = psMat.compose(
                psMat.scale(sx, sy),
                psMat.translate(exp[0] - m[0] * sx, exp[1] - m[1] * sy),
            )
            print("calibration: scale=(%.5f, %.5f)" % (sx, sy))
        g.transform(correction)
        g.removeOverlap()
        g.correctDirection()
        g.round()
        if mode == "asis":
            g.width = int(item.get("adv", 56) * SCALE)  # 小書きはプロポーショナル、他は全角 1792
        else:
            # 左右ベアリングを必ず等しくする (横位置は図面ではなくこの規則で決める)
            b = g.boundingBox()
            ink_w = b[2] - b[0]
            adv = ink_w + 5 * SCALE if mode == "family" else KANA_WIDTH
            g.transform(psMat.translate(round((adv - ink_w) / 2 - b[0]), 0))
            g.width = int(round(adv))
        g.vwidth = EM
        b = g.boundingBox()
        # 横位置は mode で意図的に動かすので、検算は縦 (と mode=asis のときだけ横も) で見る
        axes = (0, 1, 2, 3) if mode == "asis" else (1, 3)
        delta = max(abs(b[i] - exp[i]) for i in axes)
        mark = "" if delta <= 2.0 else "  <-- DELTA!"
        print("U+%05X %s bboxDelta=%.1f%s" % (item["cp"], item["label"], delta, mark))
        imported += 1
        done.add(item["cp"])

    make_combining_marks(font, done)
    make_ideographic_space(font, done)
    make_fullwidth_forms(font, done)
    make_tofu(font, done)
    make_borrowed_glyphs(font, done)

    os.remove(tmp)
    out_sfd = os.path.join(out_dir, basename + ".sfd")
    out_ttf = os.path.join(out_dir, basename + ".ttf")
    out_woff = os.path.join(out_dir, basename + ".woff")
    font.save(out_sfd)
    font.generate(out_ttf)
    font.generate(out_woff)
    write_coverage_js(font, out_dir)
    print("imported=%d -> %s / .ttf / .woff" % (imported, out_sfd))


if __name__ == "__main__":
    main()
