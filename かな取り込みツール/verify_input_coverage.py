# -*- coding: utf-8 -*-
"""フォント収録文字に画面キーボードから到達できるか検証する。

usage:
  python verify_input_coverage.py [../asteain.ttf]
  python verify_input_coverage.py --summary-only [../asteain.ttf]
"""

import argparse
import json
import subprocess
import sys
import unicodedata
from pathlib import Path

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FONT = ROOT / "asteain.ttf"
COLLECTOR = ROOT / "かな取り込みツール" / "collect_input_chars.js"

GROUPS = [
    ("ASCII", 0x0020, 0x007E),
    ("和文記号", 0x3000, 0x303F),
    ("ひらがな", 0x3041, 0x309F),
    ("カタカナ", 0x30A0, 0x30FF),
    ("カタカナ拡張", 0x31F0, 0x31FF),
    ("全角形", 0xFF01, 0xFF5E),
    ("半角カタカナ", 0xFF61, 0xFF9F),
    ("古字・小書き拡張", 0x1B000, 0x1B16F),
]

# 々はこのプロジェクトでは漢字扱い。
EXCLUDED = {0x3005}


def character_label(codepoint):
    character = chr(codepoint)
    shown = "SPACE" if codepoint == 0x20 else character
    name = unicodedata.name(character, "名称なし")
    return f"U+{codepoint:04X} {shown}\t{name}"


def collect_reachable():
    completed = subprocess.run(
        ["node", str(COLLECTOR)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(completed.stdout)


def is_private_use(codepoint):
    return (
        0xE000 <= codepoint <= 0xF8FF
        or 0xF0000 <= codepoint <= 0xFFFFD
        or 0x100000 <= codepoint <= 0x10FFFD
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("font", nargs="?", type=Path, default=DEFAULT_FONT)
    parser.add_argument("--summary-only", action="store_true", help="未到達文字の明細を省略する")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    cmap = TTFont(args.font).getBestCmap()
    reachable_data = collect_reachable()
    reachable = set(reachable_data["all"])

    print(
        "入力可能文字: "
        f"QWERTY {len(reachable_data['qwerty'])} / "
        f"50音 {len(reachable_data['kana_table'])} / "
        f"合計 {len(reachable)}"
    )

    grouped_targets = []
    known_targets = set()
    for title, lower, upper in GROUPS:
        targets = {
            codepoint
            for codepoint in cmap
            if lower <= codepoint <= upper and codepoint not in EXCLUDED
        }
        grouped_targets.append((title, targets))
        known_targets.update(targets)

    other_targets = {
        codepoint
        for codepoint in cmap
        if codepoint not in known_targets
        and codepoint not in EXCLUDED
        and not is_private_use(codepoint)
    }
    if other_targets:
        grouped_targets.append(("その他の非PUA文字", other_targets))

    all_targets = set()
    all_missing = set()
    for title, targets in grouped_targets:
        missing = targets - reachable
        all_targets.update(targets)
        all_missing.update(missing)
        if not targets:
            status = "NOT IN FONT"
        else:
            status = "PASS" if not missing else "MISSING"
        print(f"{title}: {len(targets) - len(missing)}/{len(targets)} {status}")
        if missing and not args.summary_only:
            for codepoint in sorted(missing):
                print("  " + character_label(codepoint))

    print(f"対象合計: {len(all_targets) - len(all_missing)}/{len(all_targets)}")
    print("除外: U+3005 々（漢字扱い）")
    return 1 if all_missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
