# -*- coding: utf-8 -*-
"""自動生成グリフの対応表を、ビルド済みフォントの実データから HTML に起こす。

  python gen_autogen_table.py [../asteain.ttf] [自動生成対応表.html]

手書きの表だと実装とズレても気づけないので、必ず現物 (ttf) から読む。
- 参照 (コンポジット) のグリフ … glyf テーブルから「どの字を参照しているか」を読む
- 縦書き変体 … GSUB の vert/vrt2 の置換一覧を読む
表示には asteain 自身 (../asteain.woff) を使うので、字形の確認がその場でできる。
"""
import html
import sys

from fontTools.ttLib import TTFont

FONT = sys.argv[1] if len(sys.argv) > 1 else "../asteain.ttf"
OUT = sys.argv[2] if len(sys.argv) > 2 else "自動生成対応表.html"


def ch(cp):
    return html.escape(chr(cp))


def main():
    f = TTFont(FONT)
    cmap = f.getBestCmap()
    rev = {}
    for cp, name in cmap.items():
        rev.setdefault(name, cp)
    glyf = f["glyf"]
    hmtx = f["hmtx"]

    # ① 参照で出来ているグリフ (符号位置つき・単一参照のもの)
    refs = []
    for cp, name in sorted(cmap.items()):
        g = glyf[name]
        if not g.isComposite() or len(g.components) != 1:
            continue
        src_name = g.components[0].glyphName
        src_cp = rev.get(src_name)
        refs.append((cp, src_cp, src_name, hmtx[name][0] / 32))

    # 全角形 = 「元の字がちょうど 0xFEE0 手前」の参照だけ。～ (元は 301C) は借用側に出す
    fullwidth = [r for r in refs if r[1] is not None and r[0] - r[1] == 0xFEE0]
    others = [r for r in refs if r not in fullwidth]

    # ② 縦書き変体 (GSUB の vert/vrt2)
    vert = {}
    gsub = f["GSUB"].table
    want = set()
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag in ("vert", "vrt2"):
            want.update(fr.Feature.LookupListIndex)
    for i in sorted(want):
        for st in gsub.LookupList.Lookup[i].SubTable:
            if hasattr(st, "mapping"):
                vert.update(st.mapping)

    rows_fw = "\n".join(
        f"<tr><td class='g'>{ch(cp)}</td><td>U+{cp:04X}</td>"
        f"<td class='g'>{ch(sc) if sc else '?'}</td><td>U+{sc:04X}</td><td>{adv:.0f}</td></tr>"
        for cp, sc, sn, adv in fullwidth
    )
    note = {0x3008: "デーレ文字と同形", 0x3009: "デーレ文字と同形",
            0x30A0: "= と同形", 0xFF5E: "図面の波ダッシュを使う"}
    rows_ot = "\n".join(
        f"<tr><td class='g'>{ch(cp)}</td><td>U+{cp:04X}</td>"
        f"<td class='g'>{ch(sc) if sc else html.escape(sn)}</td>"
        f"<td>{'U+%04X' % sc if sc else '-'}</td><td>{adv:.0f}</td>"
        f"<td>{note.get(cp, '')}</td></tr>"
        for cp, sc, sn, adv in others
    )

    def vrule(cp):
        if cp in (0x3001, 0x3002):
            return "右上 (位置を点対称に)"
        if cp is None:
            return "専用字形"
        return "右寄り・流れ方向中央"

    rows_v = []
    for base_name, vname in sorted(vert.items(), key=lambda kv: rev.get(kv[0], 0x10FFFF)):
        cp = rev.get(base_name)
        label = ch(cp) if cp else html.escape(base_name)
        cps = f"U+{cp:04X}" if cp else "-"
        rows_v.append(f"<tr><td class='g'>{label}</td><td>{cps}</td>"
                      f"<td>{html.escape(vname)}</td><td>{vrule(cp)}</td>"
                      f"<td>{hmtx[vname][0] / 32:.0f}</td></tr>")
    rows_v = "\n".join(rows_v)

    doc = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<title>asteain 自動生成グリフの対応表</title>
<style>
@font-face {{ font-family: asteain; src: url("../asteain.woff") format("woff"); }}
body {{ font-family: sans-serif; margin: 24px; font-size: 14px; }}
table {{ border-collapse: collapse; margin: 8px 0 24px; }}
th, td {{ border: 1px solid #bbb; padding: 3px 10px; text-align: center; }}
th {{ background: #f0f4f8; font-weight: normal; }}
td.g {{ font-family: asteain, sans-serif; font-size: 26px; }}
h2 {{ font-size: 16px; margin: 20px 0 4px; }}
p {{ color: #555; margin: 2px 0; }}
</style></head><body>
<h1 style="font-size:18px">asteain 自動生成グリフの対応表</h1>
<p>ビルド済みフォントの実データから生成 (gen_autogen_table.py)。手で編集しないこと。</p>

<h2>字形を持たない自動生成</h2>
<table><tr><th>字</th><th>符号位置</th><th>作り方</th></tr>
<tr><td class='g'>　</td><td>U+3000</td><td>全角スペース。輪郭なし・送り 56</td></tr>
<tr><td class='g'>□</td><td>U+25A1 と .notdef</td><td>豆腐。家風の枠を機械生成</td></tr>
<tr><td class='g'>&#x3099;</td><td>U+3099</td><td>結合用濁点。゛の複製・送り 0</td></tr>
<tr><td class='g'>&#x309A;</td><td>U+309A</td><td>結合用半濁点。゜の複製・送り 0</td></tr>
</table>

<h2>借用・特殊な参照 ({len(others)} 字)</h2>
<table><tr><th>字</th><th>符号位置</th><th>借り元</th><th>借り元の符号位置</th><th>送り</th><th>備考</th></tr>
{rows_ot}
</table>

<h2>全角形 ← ASCII の参照 ({len(fullwidth)} 字)</h2>
<p>（）は図面から取り込んだため、～ は借用のため、この一覧に含まれない。</p>
<table><tr><th>全角形</th><th>符号位置</th><th>元の字</th><th>元の符号位置</th><th>送り</th></tr>
{rows_fw}
</table>

<h2>縦書き変体 (vert / vrt2 の置換、{len(vert)} 字)</h2>
<p>JLREQ 準拠: 小書きは「流れ方向中央・右寄り」、句読点は「右上」。枠は全角 56。</p>
<table><tr><th>字</th><th>符号位置</th><th>縦書きグリフ</th><th>置き方</th><th>送り</th></tr>
{rows_v}
</table>
</body></html>
"""
    with open(OUT, "w", encoding="utf-8") as fp:
        fp.write(doc)
    print(f"参照 {len(refs)} 字 (全角形 {len(fullwidth)} / 借用等 {len(others)}) + 縦書き {len(vert)} 字 -> {OUT}")


if __name__ == "__main__":
    main()
