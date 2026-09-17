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
HALF_WIDTH = 28 * 32  # 半角カナ固定 896
EM = 2048


def expected_bbox(ink):
    x0, y0, x1, y1 = ink  # SVG 座標 (y 下向き)
    return (x0 * SCALE, ASCENT - y1 * SCALE, x1 * SCALE, ASCENT - y0 * SCALE)


# ── 字送りの規則 (family モード) ────────────────────────
# 基本は家風「送り = インク幅 + 5」。例外が 2 つ:
#   小書き仮名 … ベアリングを 2 倍 (計 +10)。定数ベアリングだと、インクが一回り
#     小さい小書きは送りの比率が 0.69 まで落ち、調査した全書体 (0.75〜1.00、
#     主流 0.83〜0.91) より詰まってしまうため。+10 で比率 ≈ 0.80 になる。
#   句読点・括弧 … 半角 (28 単位) の枠。JLREQ の「句読点・括弧類は二分アキを
#     伴う」に従う。開き括弧はインクを右に寄せ (前アキ)、閉じと句読点は左に寄せる (後アキ)。
SMALL_KANA = ({0x3041, 0x3043, 0x3045, 0x3047, 0x3049, 0x3063, 0x3083, 0x3085, 0x3087, 0x308E,
               0x30A1, 0x30A3, 0x30A5, 0x30A7, 0x30A9, 0x30C3, 0x30E3, 0x30E5, 0x30E7, 0x30EE,
               0x30F5, 0x30F6}
              | set(range(0x31F0, 0x3200))
              | {0x1B132, 0x1B150, 0x1B151, 0x1B152, 0x1B155, 0x1B164, 0x1B165, 0x1B166, 0x1B167})
PUNCT_LEFT = {0x3001, 0x3002, 0x300B, 0x300D, 0x300F, 0x3011, 0x3015, 0x3017,
              0xFF09, 0xFF3D, 0xFF5D}
PUNCT_RIGHT = {0x300A, 0x300C, 0x300E, 0x3010, 0x3014, 0x3016,
               0xFF08, 0xFF3B, 0xFF5B}
HALF = 28


def metrics_for(cp, ink_w):
    """family モードでの (送り幅, インクの寄せ方) を返す"""
    if 0xFF61 <= cp <= 0xFF9F:
        return HALF_WIDTH, "center"
    if cp in PUNCT_LEFT:
        return HALF * SCALE, "left"
    if cp in PUNCT_RIGHT:
        return HALF * SCALE, "right"
    if cp in SMALL_KANA:
        return ink_w + 10 * SCALE, "center"
    return ink_w + 5 * SCALE, "center"


def fit_punctuation_to_halfwidth(g, cp):
    """半角枠の括弧が左右ベアリング2.5を割らないよう、横だけ縮める。"""
    if cp not in PUNCT_LEFT | PUNCT_RIGHT:
        return False
    b = g.boundingBox()
    ink_w = b[2] - b[0]
    target_ink = HALF_WIDTH - 5 * SCALE
    if ink_w <= target_ink:
        return False
    sx = target_ink / ink_w
    g.transform(psMat.translate(-b[0], 0))
    g.transform(psMat.scale(sx, 1.0))
    g.round()
    return True

# 結合用の濁点・半濁点。単独版 (U+309B/309C) の輪郭をそのまま使う。
COMBINING = {0x3099: 0x309B, 0x309A: 0x309C}


def glyphs_by_unicode(font):
    """コードポイント → グリフ の対応表を、**グリフ自身の unicode から**作る。

    `font[cp]` (符号位置スロットで引く) は使わないこと。このフォントには
    **同じ名前のグリフが 2 つある** 箇所があり (`less` が U+003C と U+F2A0F に),
    スロット引きだと誤った方を掴む。実際 ＜ (U+FF1C) が別の字を参照していた。
    """
    m = {}
    for g in font.glyphs():
        if g.unicode and g.unicode > 0:
            m.setdefault(g.unicode, g)
        for alt in (g.altuni or ()):
            if alt[0] > 0:
                m.setdefault(alt[0], g)
    return m

def duplicated_names(font):
    """同じ名前を持つグリフが複数ある名前の集合。

    このフォントには `less` が 2 つある (U+003C の正しい ＜ と、U+F2A0F の別字)。
    参照 (addReference) は**名前で解決される**ので、同名が複数あると狙った方を
    指せない。そういう字は参照ではなく輪郭の複製で作る。
    """
    seen, dup = set(), set()
    for g in font.glyphs():
        if g.glyphname in seen:
            dup.add(g.glyphname)
        seen.add(g.glyphname)
    return dup


def put_outline(dst, src, dup_names, offset=0):
    """src の字形を dst に置く。名前が一意なら参照、重複していれば輪郭を複製する。"""
    dst.clear()
    if src.glyphname in dup_names:
        dst.foreground = src.foreground.dup()
        if offset:
            dst.transform(psMat.translate(offset, 0))
        return "複製"
    if offset:
        dst.addReference(src.glyphname, psMat.translate(offset, 0))
    else:
        dst.addReference(src.glyphname)
    return "参照"

def make_combining_marks(font, done=(), by_uni=None):
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
        src = (by_uni or glyphs_by_unicode(font)).get(src_cp)
        if src is None:
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


def make_fullwidth_forms(font, done=(), by_uni=None):
    """全角形 (U+FF01〜FF5E) を ASCII (U+0021〜007E) から作る。

    **字形は参照 (リファレンス) で共有する。** 実体は ASCII 側の 1 つだけなので、
    あとで `(` を描き直せば `（` も自動で追従するし、ファイルも太らない。
    やることは「送り幅を全角 (升目 1 つぶん) にして、インクを中央に置く」だけ。

    普通の日本語フォントは全角形を別に描くが、それは**ラテンとかなで寸法系が
    違うから**の対処。このフォントは実測でラテンの括弧もかなと同じ縦の帯
    (y 1〜51) に載っているので、その必要がない。
    """
    by_uni = by_uni or glyphs_by_unicode(font)
    dup_names = duplicated_names(font)
    made, skipped, copied = 0, [], []
    for cp in range(0x21, 0x7F):
        full = cp + 0xFEE0  # ASCII → 全角形 のオフセット
        if full in done:
            skipped.append(full)
            continue
        if full in BORROWED:
            continue  # 借用で作る字 (～ など) はそちらに任せる
        src = by_uni.get(cp)
        if src is None or src.isWorthOutputting() is False:
            continue
        b = src.boundingBox()
        if b[2] <= b[0]:
            continue
        g = font.createChar(full)
        # 括弧類は他の和字括弧 (「」〔〕等) と同じく半角枠・前後アキ寄せにする
        if full in PUNCT_RIGHT:
            box = HALF * SCALE
            dx = (box - 2.5 * SCALE) - b[2]
        elif full in PUNCT_LEFT:
            box = HALF * SCALE
            dx = 2.5 * SCALE - b[0]
        else:
            box = KANA_WIDTH
            dx = (box - (b[2] - b[0])) / 2 - b[0]
        how = put_outline(g, src, dup_names, round(dx))
        if how == "複製":
            copied.append(full)
        g.width = int(round(box))
        g.vwidth = EM
        made += 1
    print("全角形 U+FF01〜FF5E を %d 字生成 (ASCII への参照・送り %.0f 単位)"
          % (made, KANA_WIDTH / SCALE))
    if copied:
        print("  うち %s は借り元の名前が重複しているので、参照ではなく輪郭を複製した"
              % " ".join("U+%04X" % c for c in copied))
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
#   ～   … 全角チルダ (U+FF5E)。日本語入力で「〜」と打つと大抵こちらが入るので、
#          ASCII ~ の全角化ではなく、図面の波ダッシュ 〜 (U+301C) を使う
BORROWED = {0x3008: 0xF2F8B, 0x3009: 0xF2F8C, 0x30A0: 0x003D, 0xFF5E: 0x301C}

# 半角カナのうち、専用図面を要しない記号類。小書き9字 (U+FF67〜FF6F) は
# 機械縮小せず、専用図面から取り込む。
HALFWIDTH_AUTO = {
    0xFF61: 0x3002,  # ｡ ← 。
    0xFF62: 0x300C,  # ｢ ← 「
    0xFF63: 0x300D,  # ｣ ← 」
    0xFF64: 0x3001,  # ､ ← 、
    0xFF65: 0x30FB,  # ･ ← ・
    0xFF70: 0x30FC,  # ｰ ← ー
    0xFF9E: 0x309B,  # ﾞ ← ゛
    0xFF9F: 0x309C,  # ﾟ ← ゜
}


def make_halfwidth_forms(font, done=(), by_uni=None):
    """半角カナの記号類を既存字形から作り、送りを28単位に揃える。"""
    by_uni = by_uni or glyphs_by_unicode(font)
    dup_names = duplicated_names(font)
    made = 0
    for cp, src_cp in HALFWIDTH_AUTO.items():
        if cp in done:
            continue
        src = by_uni.get(src_cp)
        if src is None or src.isWorthOutputting() is False:
            print("半角 U+%04X: 借り元 U+%04X が無いので飛ばす" % (cp, src_cp))
            continue

        g = font.createChar(cp)
        if cp == 0xFF70:
            # 長音だけは全角の字面が広すぎるので、線の高さを保ったまま横だけ縮める。
            g.clear()
            g.addReference(src.glyphname)
            g.unlinkRef()
            b = g.boundingBox()
            target_ink = HALF_WIDTH - 5 * SCALE
            sx = min(1.0, target_ink / (b[2] - b[0]))
            g.transform(psMat.translate(-b[0], 0))
            g.transform(psMat.scale(sx, 1.0))
            b = g.boundingBox()
            g.transform(psMat.translate((HALF_WIDTH - (b[2] - b[0])) / 2 - b[0], 0))
            how = "横縮小"
        else:
            b = src.boundingBox()
            if cp in (0xFF65, 0xFF9E, 0xFF9F):
                dx = (HALF_WIDTH - (b[2] - b[0])) / 2 - b[0]
            else:
                # 句読点と括弧は元字がすでに28単位枠の前後アキ位置にある。
                dx = 0
            how = put_outline(g, src, dup_names, round(dx))
        g.width = HALF_WIDTH
        g.vwidth = EM
        g.round()
        made += 1
        print("半角 U+%04X ← U+%04X (%s) 送り %.0f 単位"
              % (cp, src_cp, how, HALF_WIDTH / SCALE))
    missing_small = [cp for cp in range(0xFF67, 0xFF70) if cp not in done]
    print("半角記号類 %d 字を生成 / 小書き専用図面 %d/9 字を収録" % (made, 9 - len(missing_small)))


def make_borrowed_glyphs(font, done=(), by_uni=None):
    """既にある同形のグリフを参照して作る。

    字送りも借り元のまま使う。借り元は家風 (送り = インク幅 + 5) で作られているので、
    そのまま持ってくれば規則も揃う。借り元を描き直せばこちらも追従する。
    """
    for cp, src_cp in BORROWED.items():
        if cp in done:
            print("借用 U+%04X: 図面から取り込み済みなので自動生成しない" % cp)
            continue
        src = (by_uni or glyphs_by_unicode(font)).get(src_cp)
        if src is None:
            print("借用 U+%04X: 借り元 U+%05X が無いので飛ばす" % (cp, src_cp))
            continue
        g = font.createChar(cp)
        how = put_outline(g, src, duplicated_names(font))
        g.width = src.width
        g.vwidth = EM
        print("借用 U+%04X ← U+%05X (%s) 送り %.1f 単位 [%s]"
              % (cp, src_cp, src.glyphname, src.width / SCALE, how))

def make_vertical_variants(font, by_uni):
    """縦書き用の変体 (.vert) を作り、vert / vrt2 の置換に登録する。

    JLREQ (W3C 日本語組版処理の要件) に従う:
      小書き仮名 … 縦組みでは「流れ方向は中央、左右方向は右寄り」。
      句読点 、。 … 縦組みでは文字外枠の右上。
    枠は全角 (56 単位)。横書きの狭い送りのままインクを右に出すと隣の列に
    はみ出すため (実測済み)、縦書き変体だけ全角枠にする。これは
    「縦組みの既定は全角送り、詰めは vpal でオプトイン」という OpenType の
    慣例とも一致する。字形は参照なので実体は増えない。
    """
    subtables = []
    for lk in font.gsub_lookups:
        info = font.getLookupInfo(lk)
        if info[2] and info[2][0][0] in ("vert", "vrt2"):
            subtables += list(font.getLookupSubtables(lk))
    if not subtables:
        print("縦書き変体: vert/vrt2 のルックアップが無いので飛ばす")
        return

    frame = KANA_WIDTH                      # 全角枠 56 単位
    right = frame - round(2.5 * SCALE)      # 右端はインク右を枠右から 2.5 内側へ
    v_center = (ASCENT - 410) // 2          # 流れ方向の中央 (em の縦中心) = 614
    made = 0
    for cp in sorted(SMALL_KANA | {0x309B, 0x309C} | {0x3001, 0x3002}):
        g = by_uni.get(cp)
        if g is None:
            continue
        b = g.boundingBox()
        if b[2] <= b[0]:
            continue
        dx = right - b[2]
        if cp in (0x3001, 0x3002):
            # 句読点は位置を点対称に写す: 左下 (横組) → 右上 (縦組)
            dy = (2 * ASCENT - 64 * SCALE - b[1]) - b[3]
        else:
            dy = v_center - (b[1] + b[3]) / 2
        name = g.glyphname + ".vert"
        v = font.createChar(-1, name)
        v.clear()
        v.addReference(g.glyphname, psMat.translate(round(dx), round(dy)))
        v.width = frame
        v.vwidth = EM
        for st in subtables:
            try:
                g.removePosSub(st)   # 再ビルドでの重複登録を防ぐ
            except Exception:
                pass
            g.addPosSub(st, name)
        made += 1
    print("縦書き変体 %d 字を生成 (JLREQ: 小書き=右寄り・流れ方向中央 / 句読点=右上)" % made)

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
            # 横位置は図面ではなくこの規則で決める
            if mode == "family" and fit_punctuation_to_halfwidth(g, item["cp"]):
                print("  U+%04X 括弧を28単位枠へ横幅補正" % item["cp"])
            b = g.boundingBox()
            ink_w = b[2] - b[0]
            if mode == "family":
                adv, align = metrics_for(item["cp"], ink_w)
            else:
                adv, align = KANA_WIDTH, "center"
            if align == "left":
                dx = 2.5 * SCALE - b[0]
            elif align == "right":
                dx = (adv - 2.5 * SCALE) - b[2]
            else:
                dx = (adv - ink_w) / 2 - b[0]
            g.transform(psMat.translate(round(dx), 0))
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

    by_uni = glyphs_by_unicode(font)
    make_combining_marks(font, done, by_uni)
    make_ideographic_space(font, done)
    make_fullwidth_forms(font, done, by_uni)
    make_tofu(font, done)
    make_borrowed_glyphs(font, done, by_uni)
    make_halfwidth_forms(font, done, glyphs_by_unicode(font))
    make_vertical_variants(font, glyphs_by_unicode(font))

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
