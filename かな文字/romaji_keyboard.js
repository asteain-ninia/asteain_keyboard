// ヘボン式・訓令式ローマ字 → かな。
const 基本行 = ["a", "k", "s", "t", "n", "h", "m", "y", "r", "w", "g", "z", "d", "b", "p", "v"];

function かな行追加(table, rows, prefixes = [""], rowNames = Object.keys(rows)) {
  for (const row of rowNames) {
    let romajiRow = row;
    if (row === "a") {
      romajiRow = "";
    }
    rows[row].forEach((kana, index) => {
      if (!kana) return;
      for (const prefix of prefixes) {
        table[prefix + romajiRow + 母音[index]] = kana;
      }
    });
  }
}

const ひらがな変換表 = {};
かな行追加(ひらがな変換表, 五十音表.hiragana, [""], 基本行);

// 記号はキーの見た目どおりの和文対応字だけ変換する。
// (@→゛ のような JIS かな配列の位置借りはしない。゛゜ゝゞゟ゠などは五十音ページで入力する)
Object.assign(ひらがな変換表, {
  yi: "い", // ひらがな・や行い段は未収録
  "n'": "ん",
  "-": "ー",
  ",": "、",
  ".": "。",
  "/": "・",
  "!": "！",
  "?": "？",
});

// nは母音・y以外が続いた時点で「ん」に確定する
const ん保留字 = "aiuey";
const 促音子音 = "kstpgzdbfcjmyrwh".split("");

// 共有データから、ひらがなと対応するカタカナを作る。
const ひらカタ対応表 = {};

function ひらカタ対追加(hiraganaRows, katakanaRows) {
  for (const row in hiraganaRows) {
    if (!katakanaRows[row]) continue;
    hiraganaRows[row].forEach((hiragana, index) => {
      const katakana = katakanaRows[row][index];
      if (hiragana && katakana) ひらカタ対応表[hiragana] = katakana;
    });
  }
}

ひらカタ対追加(五十音表.hiragana, 五十音表.katakana);
ひらカタ対追加(小書き表.hiragana, 小書き表.katakana);

function 一字カタカナ化(ch) {
  if (Object.prototype.hasOwnProperty.call(ひらカタ対応表, ch)) {
    return ひらカタ対応表[ch];
  }
  const cp = ch.codePointAt(0);
  if (cp >= 0x3041 && cp <= 0x3096) {
    return String.fromCodePoint(cp + 0x60);
  }
  return ch;
}

function カタカナ化(str) {
  return Array.from(str).map(一字カタカナ化).join("");
}

const 小書き母音 = 小書き表.hiragana.a;
const 小書きや段 = [
  小書き表.hiragana.y[0], 小書き表.hiragana.a[1],
  小書き表.hiragana.y[2], 小書き表.hiragana.a[3],
  小書き表.hiragana.y[4],
];
const 小書きわ段 = [
  小書き表.hiragana.w[0], 小書き表.hiragana.w[1],
  小書き表.hiragana.a[2], 小書き表.hiragana.w[3],
  小書き表.hiragana.w[4],
];
const 小書きや段い抜き = [小書きや段[0], "", 小書きや段[2], 小書きや段[3], 小書きや段[4]];
const 小書き母音う抜き = [小書き母音[0], 小書き母音[1], "", 小書き母音[3], 小書き母音[4]];

const COMPOUND_五十音表 = {
  k: {
    ky: ["き", 小書きや段],
    q: ["く", 小書き表.hiragana.w], // quは未収録
    kw: ["く", 小書きわ段],
  },
  s: {
    sh: ["し", 小書きや段い抜き],
    sy: ["し", 小書きや段],
  },
  t: {
    ch: ["ち", 小書きや段い抜き],
    ty: ["ち", 小書きや段],
    th: ["て", 小書きや段],
    tw: ["と", 小書きわ段],
    ts: ["つ", 小書き母音う抜き],
  },
  n: { ny: ["に", 小書きや段] },
  h: {
    hy: ["ひ", 小書きや段],
    f: ["ふ", 小書き母音う抜き],
    fy: ["ふ", 小書きや段],
  },
  m: { my: ["み", 小書きや段] },
  r: { ry: ["り", 小書きや段] },
  w: { wh: ["う", 小書き母音] },
  g: {
    gy: ["ぎ", 小書きや段],
    gw: ["ぐ", 小書きわ段],
  },
  z: {
    j: ["じ", 小書きや段い抜き],
    zy: ["じ", 小書きや段],
  },
  d: {
    dy: ["ぢ", 小書きや段],
    dh: ["で", 小書きや段],
    dw: ["ど", 小書きわ段],
  },
  b: { by: ["び", 小書きや段] },
  p: { py: ["ぴ", 小書きや段] },
  v: {
    v: ["ゔ", 小書き母音う抜き],
    vy: ["ゔ", 小書きや段],
  },
};

function 拗音追加(table, rows) {
  for (const row in rows) {
    for (const romaji in rows[row]) {
      const [base, endings] = rows[row][romaji];
      endings.forEach((ending, index) => {
        // 番兵の使い分け: null = その組は未収録なので登録しない (qu など)、
        // "" = 小書きを付けず基底のかなだけで確定する (chi → ち など)。
        if (ending === null) return;
        table[romaji + 母音[index]] = base + ending;
      });
    }
  }
}

拗音追加(ひらがな変換表, COMPOUND_五十音表);

const カタカナ変換表 = {};
for (const key in ひらがな変換表) {
  カタカナ変換表[key] = カタカナ化(ひらがな変換表[key]);
}
かな行追加(カタカナ変換表, 五十音表.katakana, [""], 基本行);

// カタカナ専用文字
Object.assign(カタカナ変換表, {
  // va系はヴァ等に使うためwva系で区別
  wva: 五十音表.katakana.vw[0], wvi: 五十音表.katakana.vw[1],
  wve: 五十音表.katakana.vw[3], wvo: 五十音表.katakana.vw[4],
});

かな行追加(ひらがな変換表, 小書き表.hiragana, ["x", "l"]);
かな行追加(カタカナ変換表, 小書き表.katakana, ["x", "l"]);

Object.assign(ひらがな変換表, { xtsu: "っ", ltsu: "っ" });
Object.assign(カタカナ変換表, {
  xtsu: "ッ", ltsu: "ッ",
  xshi: "ㇱ", lshi: "ㇱ",
  xfu: "ㇷ", lfu: "ㇷ",
  xnn: 小書き撥音表.katakana, lnn: 小書き撥音表.katakana,
});

const 半角カナ変換表 = {};
for (const key in カタカナ変換表) {
  半角カナ変換表[key] = 半角カタカナ化(カタカナ変換表[key]);
}

// 半角表のキーはカタカナ表から1:1で導出したものなので走査不要。
const ローマ字最大長 = Math.max(
  ...Object.keys(ひらがな変換表).map((key) => key.length),
  ...Object.keys(カタカナ変換表).map((key) => key.length),
);

let kanaMode = "hiragana"; // "hiragana" | "katakana"
let halfwidthKanaMode = false;
let fullwidthAsciiMode = false;

function 現在の変換表() {
  if (kanaMode === "katakana") {
    if (halfwidthKanaMode) {
      return 半角カナ変換表;
    }
    return カタカナ変換表;
  }
  return ひらがな変換表;
}

function カタカナ出力(value) {
  if (halfwidthKanaMode) {
    return 半角カタカナ化(value);
  }
  return value;
}

// かなモードに応じた文字を返す (カタカナ時は半角ｶﾅ変換込み)。
function 現在のかな(hira, kata) {
  if (kanaMode === "katakana") {
    return カタカナ出力(kata);
  }
  return hira;
}

let imeOn = true;

function insertLogic(value1, insertChar) {
  if (!imeOn) {
    if (fullwidthAsciiMode) {
      return value1 + 全角英数化(insertChar);
    }
    return value1 + insertChar;
  }
  let normalizedChar = insertChar;
  if (/^[A-Z]$/.test(insertChar)) {
    normalizedChar = insertChar.toLowerCase();
  }
  const buffer = value1 + normalizedChar;
  const table = 現在の変換表();

  for (let len = ローマ字最大長; len >= 1; len--) {
    if (buffer.length < len) continue;
    const tail = buffer.slice(-len);
    // n直後の記号は、下の「ん」確定処理へ回す
    if (len === 1 && buffer.length >= 2 && buffer[buffer.length - 2] === "n" && !/^[a-z]$/.test(tail)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(table, tail)) {
      return buffer.slice(0, -len) + table[tail];
    }
  }

  // matcha → まっちゃ
  if (buffer.length >= 3 && buffer.slice(-3) === "tch") {
    return buffer.slice(0, -3) + 現在のかな("っ", "ッ") + "ch";
  }

  if (buffer.length >= 2) {
    const prev = buffer[buffer.length - 2];
    const last = buffer[buffer.length - 1];
    if (prev === last && 促音子音.includes(prev)) {
      return buffer.slice(0, -2) + 現在のかな("っ", "ッ") + last;
    }
    if (prev === "n" && !ん保留字.includes(last)) {
      const ん = 現在のかな("ん", "ン");
      // 専用キーで入れた「ん」は重ねない
      if (last === ん) {
        return buffer.slice(0, -2) + ん;
      }
      let convertedLast = last;
      if (Object.prototype.hasOwnProperty.call(table, last)) {
        convertedLast = table[last];
      }
      return buffer.slice(0, -2) + ん + convertedLast;
    }
  }

  return buffer;
}

function updateModeToggleLabel() {
  const button = document.getElementById("kanaModeToggle");
  if (!button) return;
  if (kanaMode === "katakana") {
    button.textContent = "ひらがなにする";
  } else {
    button.textContent = "カタカナにする";
  }
}

function toggleKanaMode() {
  if (kanaMode === "katakana") {
    kanaMode = "hiragana";
  } else {
    kanaMode = "katakana";
  }
  if (kanaMode === "hiragana") halfwidthKanaMode = false;
  updateModeToggleLabel();
  updateWidthToggleLabel();
}

function updateWidthToggleLabel() {
  const button = document.getElementById("widthToggle");
  if (!button) return;

  let active;
  if (!imeOn) {
    button.disabled = false;
    active = fullwidthAsciiMode;
    if (active) {
      button.innerHTML = "半角英数にする";
    } else {
      button.innerHTML = "全角英数にする";
    }
  } else {
    button.disabled = kanaMode !== "katakana";
    active = halfwidthKanaMode;
    if (active) {
      button.innerHTML = "全角カナにする";
    } else {
      button.innerHTML = "半角ｶﾅにする";
    }
  }
  updateToggleKeyVisual("widthToggle", active);
}

function toggleWidthMode() {
  if (!imeOn) {
    fullwidthAsciiMode = !fullwidthAsciiMode;
  } else if (kanaMode === "katakana") {
    halfwidthKanaMode = !halfwidthKanaMode;
  } else {
    return;
  }
  updateWidthToggleLabel();
}

// Shift/CapsLockによるキー表示切替
let shiftOn = false;
let capsOn = false;

// syllabary.js と同形のトグルキー点灯処理 (このページは syllabary.js を読まないため手元に持つ)。
function updateToggleKeyVisual(id, on) {
  const button = document.getElementById(id);
  if (!button) return;
  button.classList.toggle("key-active", on);
  button.setAttribute("aria-pressed", String(on));
}

// JIS 配列の [通常, Shift] の行対。QWERTY.html の行構造と対:
// 各 keyboardRow の先頭からの .button がこの文字列の各文字に当たる (行位置が契約)。
// 挿入文字はラベルそのもの。Shift+0 は JIS では無割り当てなので同字にしてある。
const JIS配列 = [
  ["1234567890-^¥", "!\"#$%&'()0=~|"],
  ["qwertyuiop@[", "QWERTYUIOP`{"],
  ["asdfghjkl;:]", "ASDFGHJKL+*}"],
  ["zxcvbnm,./\\", "ZXCVBNM<>?_"],
];

function updateKeyLabels() {
  const keyboardRows = document.querySelectorAll(".keyboardRow");
  JIS配列.forEach((rowPair, rowIndex) => {
    const [normals, shifts] = rowPair;
    // 行頭の Tab など機能キーは数えない (刻印ではなく textContent を挿す普通のキーになったため)。
    const keys = keyboardRows[rowIndex].querySelectorAll(".button:not(.functionButton)");
    for (let i = 0; i < normals.length; i++) {
      const normal = normals[i];
      const shifted = shifts[i];
      let next = normal;
      if (normal.toUpperCase() === shifted && normal !== shifted) {
        // 英字の大文字化は Shift と CapsLock の排他的論理和。
        if (shiftOn !== capsOn) {
          next = shifted;
        }
      } else if (shiftOn) {
        next = shifted;
      }
      keys[i].textContent = next;
    }
  });
}

function Shift() {
  shiftOn = !shiftOn;
  updateKeyLabels();
  document.querySelectorAll(".shiftToggleKey").forEach((button) => {
    button.classList.toggle("key-active", shiftOn);
  });
}

// keyboard_controls.js の矢印キーが参照するフック。このページの Shift は
// 押しっぱなし式トグルなので、点灯中は矢印で範囲選択が伸び続ける (消費しない)。
function isKeyboardShiftActive() {
  return shiftOn;
}

function consumeKeyboardShift() {
  // 押しっぱなし式なので何もしない (かなページの1回限り Shift との仕様差をここで吸収)。
}

function CapsLock() {
  capsOn = !capsOn;
  updateKeyLabels();
  updateToggleKeyVisual("capsLockKey", capsOn);
}

updateKeyLabels();

function updateImeToggleLabel() {
  const button = document.getElementById("imeToggle");
  if (!button) return;
  if (imeOn) {
    button.innerHTML = "IMEを<br />Offに";
  } else {
    button.innerHTML = "IMEを<br />Onに";
  }
}

function toggleIME() {
  imeOn = !imeOn;
  updateImeToggleLabel();
  updateWidthToggleLabel();
}

updateModeToggleLabel();
updateImeToggleLabel();
updateWidthToggleLabel();
