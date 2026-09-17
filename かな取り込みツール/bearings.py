# -*- coding: utf-8 -*-
"""asteain.ttf の全グリフについて左右サイドベアリングを実測し、文字体系ごとに集計する。

すべて 64 単位のデザイン空間 (フォント内部 em2048 ÷32) で報告する。
usage: python bearings.py <font.ttf>
"""
import statistics as st
import sys
from collections import Counter

from fontTools.ttLib import TTFont

SCALE = 32.0

# 既知の代表コードポイント (キーボード/変換器の実装から)
KNOWN = [
    (0x0020, 0x007E, "ASCII/ラテン"),
    (0x3000, 0x303F, "和文記号"),
    (0x3041, 0x31FF, "かな (今回追加)"),
    (0xFF01, 0xFF5E, "全角形"),
    (0xFF61, 0xFF9F, "半角カナ"),
    (0x1B100, 0x1B16F, "かな拡張 (今回追加)"),
    (0xF2700, 0xF27FF, "幻字"),
    (0xF2800, 0xF2ADF, "アソーグ"),
    (0xF2AE0, 0xF2BFF, "ザイロ"),
    (0xF2C00, 0xF2EFF, "新笈霜?"),
    (0xF2F00, 0xF2FFF, "デーレ"),
    (0xF3000, 0xF33FF, "その他PUA"),
]


def label(cp):
    for lo, hi, name in KNOWN:
        if lo <= cp <= hi:
            return name
    return f"未分類(U+{cp:05X}帯)"


def fmt(vals):
    vals = sorted(vals)
    if not vals:
        return "-"
    q = lambda p: vals[min(len(vals) - 1, int(len(vals) * p))]
    return f"中央{st.median(vals):5.1f} [{vals[0]:5.1f} .. {q(0.25):5.1f} .. {q(0.75):5.1f} .. {vals[-1]:5.1f}]"


def main():
    font = TTFont(sys.argv[1])
    cmap = font.getBestCmap()
    glyf = font["glyf"]
    hmtx = font["hmtx"]

    groups = {}
    zero_width = {}
    for cp, name in cmap.items():
        g = glyf[name]
        if g.numberOfContours == 0:
            continue  # 空白グリフ
        adv = hmtx[name][0]
        if adv == 0:
            # 送り幅 0 の結合文字 (U+3099/309A など)。直前の字に重ねるため
            # インクが原点の左に出るのが正しいので、左右対称の統計からは外す。
            zero_width.setdefault(label(cp), []).append(cp)
            continue
        groups.setdefault(label(cp), []).append(
            {
                "cp": cp,
                "name": name,
                "adv": adv / SCALE,
                "lsb": g.xMin / SCALE,
                "rsb": (adv - g.xMax) / SCALE,
                "ink": (g.xMax - g.xMin) / SCALE,
                "top": g.yMax / SCALE,
                "bot": g.yMin / SCALE,
            }
        )

    order = [n for _, _, n in KNOWN] + [k for k in groups if k not in [n for _, _, n in KNOWN]]
    for gname in order:
        rows = groups.get(gname)
        if not rows:
            continue
        lsbs = [r["lsb"] for r in rows]
        rsbs = [r["rsb"] for r in rows]
        advs = [r["adv"] for r in rows]
        slack = [r["adv"] - r["ink"] for r in rows]  # 左右ベアリングの合計
        print(f"\n■ {gname}  n={len(rows)}  (U+{min(r['cp'] for r in rows):05X}..U+{max(r['cp'] for r in rows):05X})")
        print(f"   送り幅 : {fmt(advs)}")
        print(f"   左LSB  : {fmt(lsbs)}")
        print(f"   右RSB  : {fmt(rsbs)}")
        print(f"   左右合計: {fmt(slack)}")
        sym = sum(1 for r in rows if abs(r["lsb"] - r["rsb"]) < 0.6)
        neg = [r for r in rows if r["lsb"] < -0.01 or r["rsb"] < -0.01]
        print(f"   左右対称(±0.5以内): {sym}/{len(rows)} = {100*sym//len(rows)}%   はみ出し(負のベアリング): {len(neg)}字")
        if gname == "半角カナ":
            wrong_width = [r for r in rows if abs(r["adv"] - 28.0) > 0.01]
            status = "PASS" if not wrong_width else "MISMATCH"
            print(f"   半角送り28.0検査: {len(rows) - len(wrong_width)}/{len(rows)} {status}")
            if wrong_width:
                print("   幅違い: " + ", ".join(
                    f"U+{r['cp']:04X}={r['adv']:.1f}" for r in wrong_width
                ))
        cl = Counter(round(v * 2) / 2 for v in lsbs).most_common(4)
        cr = Counter(round(v * 2) / 2 for v in rsbs).most_common(4)
        cs = Counter(round(v * 2) / 2 for v in slack).most_common(4)
        print(f"   LSB最頻: {cl}")
        print(f"   RSB最頻: {cr}")
        print(f"   合計最頻: {cs}")
        zw = zero_width.get(gname)
        if zw:
            print("   ※ 送り 0 の結合文字 %d 字は統計から除外: %s"
                  % (len(zw), " ".join("U+%04X" % c for c in zw)))
        if neg:
            worst = sorted(neg, key=lambda r: min(r["lsb"], r["rsb"]))[:8]
            print("   はみ出し例: " + ", ".join(f"U+{r['cp']:05X}(L{r['lsb']:.1f}/R{r['rsb']:.1f})" for r in worst))


if __name__ == "__main__":
    main()
