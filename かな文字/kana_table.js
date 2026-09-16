// 五十音キーボードのかな固有部分 (かな種別・小書き層・文字幅切替・濁点後置修飾)。
// 音節表の描画・Shift/CapsLock 層・後置修飾エンジンは ../syllabary.js が持つ。
let kanaMode = "hiragana";
let halfwidthKanaMode = false;

function 表示形(value) {
  if (kanaMode !== "katakana" || !halfwidthKanaMode || !value) return value;
  return 半角カタカナ化(value, true) || "";
}

// 五十音の格子はページの行構造そのもの: ラベル行に続く5行の keyboardRow の
// 先頭10個の .button が わ〜あ 列、最下段の先頭の .button が ん (かな文字.html と対)。
const 子音一覧 = ["w", "r", "y", "m", "h", "n", "t", "s", "k", "a"];

// 補助エリアの二変種キー。ページ読込時のラベルが基本形なので、それでキーと対応を結ぶ。
// 括弧は Shift 層で二重の変種になり、かな記号はカタカナ切替と半角ｶﾅ変換に乗る
// (、。・゠ー は同形だが、半角 ､｡･ｰ への変換対象なので表に載せる)。
const 二重括弧対応表 = { "「": "『", "」": "』", "〈": "《", "〉": "》", "【": "〖", "】": "〗" };
const 補助かな対応表 = { "、": "、", "。": "。", "・": "・", "゠": "゠", "ー": "ー", "ゝ": "ヽ", "ゟ": "ヿ" };

const 括弧キー一覧 = [];
const 補助かなキー一覧 = [];
document.querySelectorAll(".button").forEach((key) => {
  const base = key.textContent;
  if (二重括弧対応表[base]) 括弧キー一覧.push({ key, base });
  if (補助かな対応表[base]) 補助かなキー一覧.push({ key, base });
});

function updateKeyLabels() {
  let 表 = 五十音表[kanaMode];
  let ん = 撥音表[kanaMode];
  if (shiftLayerOn()) {
    表 = 小書き表[kanaMode];
    ん = 小書き撥音表[kanaMode];
  }

  renderSyllabaryGrid(子音一覧, 表, 母音.length, 1, 表示形);
  const keyboardRows = document.querySelectorAll(".keyboardRow");
  const bottomKeys = keyboardRows[母音.length + 1].querySelectorAll(".button:not(.functionButton)");
  setSyllabaryKeyLabel(bottomKeys[0], 表示形(ん));

  // space キーが挿す空白。半角ｶﾅモード以外は全角、Shift (1回限り) で全半角を反転する。
  let 空白 = "　";
  if (halfwidthKanaMode) {
    空白 = " ";
  }
  if (isKeyboardShiftActive()) {
    if (空白 === "　") {
      空白 = " ";
    } else {
      空白 = "　";
    }
  }
  document.getElementById("spaceKey").value = 空白;

  // 補助エリアの二変種キーは、読込時に結んだ基本形から表引きで描く。
  for (const { key, base } of 括弧キー一覧) {
    let value = base;
    if (shiftLayerOn()) {
      value = 二重括弧対応表[base];
    }
    setSyllabaryKeyLabel(key, 表示形(value));
  }
  for (const { key, base } of 補助かなキー一覧) {
    let value = base;
    if (kanaMode === "katakana") {
      value = 補助かな対応表[base];
    }
    setSyllabaryKeyLabel(key, 表示形(value));
  }
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
  updateKeyLabels();
  updateModeToggleLabel();
  updateWidthToggleLabel();
}

function updateWidthToggleLabel() {
  const button = document.getElementById("widthToggle");
  if (!button) return;
  const enabled = kanaMode === "katakana";
  button.disabled = !enabled;
  if (halfwidthKanaMode) {
    button.innerHTML = "全角カナにする";
  } else {
    button.innerHTML = "半角ｶﾅにする";
  }
  updateToggleKeyVisual("widthToggle", halfwidthKanaMode);
}

function toggleWidthMode() {
  if (kanaMode !== "katakana") return;
  halfwidthKanaMode = !halfwidthKanaMode;
  updateKeyLabels();
  updateWidthToggleLabel();
}

// 直前の文字に濁点・半濁点を適用する。
function 変換表作成(rowPairs) {
  const out = {};
  for (const mode in rowPairs) {
    for (const [baseRow, voicedRow] of rowPairs[mode]) {
      五十音表[mode][baseRow].forEach((base, index) => {
        const voiced = 五十音表[mode][voicedRow][index];
        if (base && voiced) out[base] = voiced;
      });
    }
  }
  return out;
}

function 半角対追加(map) {
  const out = { ...map };
  for (const [base, voiced] of Object.entries(map)) {
    const halfwidthBase = 半角カタカナ化(base, true);
    const halfwidthVoiced = 半角カタカナ化(voiced, true);
    if (halfwidthBase && halfwidthVoiced) out[halfwidthBase] = halfwidthVoiced;
  }
  return out;
}

const 濁音化表 = 半角対追加(変換表作成(濁点行対));
const 半濁音化表 = 半角対追加(変換表作成(半濁点行対));

// 繰り返し記号は五十音表 (五十音表) に載らないので、濁音化の対をここで足す。
濁音化表["ゝ"] = "ゞ";
濁音化表["ヽ"] = "ヾ";

// 「小」キー用: 通常かな→小書きかなの対応表。
function 小書き表作成() {
  const out = {};
  for (const mode in 小書き表) {
    for (const row in 小書き表[mode]) {
      五十音表[mode][row].forEach((base, index) => {
        const small = 小書き表[mode][row][index];
        if (base && small) out[base] = small;
      });
    }
    const ん = 撥音表[mode];
    const 小書きん = 小書き撥音表[mode];
    if (ん && 小書きん) out[ん] = 小書きん;
  }
  return out;
}

const 濁音相互表 = invertConversionMap(濁音化表);
const 半濁音相互表 = invertConversionMap(半濁音化表);
const 小書き相互表 = invertConversionMap(半角対追加(小書き表作成()));

// 単独記号 (字として挿入) と結合記号 (前の字に重ねる) の対。
// 収録ツール (かな取り込みツール/collect_input_chars.js) もここから読む。
const 濁点記号 = { 単独: "゛", 結合: "゙" };
const 半濁点記号 = { 単独: "゜", 結合: "゚" };

// 濁音・半濁音の体系に属する文字と、濁点記号そのもの。
// これらには結合濁点のフォールバックを使わない (ぱ+゛ が ぱ゙ になる誤動作の防止)。
const 濁点の仲間 = new Set([
  ...Object.keys(濁音相互表),
  ...Object.keys(半濁音相互表),
  "゛", "゜", "゙", "゚", "ﾞ", "ﾟ",
]);

// Shift 層では変換ではなく、字として単独の濁点記号を挿入する (半角ｶﾅ中は半角の記号)。
function 単独記号挿入(mark) {
  insertTextAtCaret(表示形(mark));
  consumeKeyboardShift();
}

function 濁点適用() {
  if (shiftLayerOn()) {
    単独記号挿入(濁点記号.単独);
    return;
  }
  applyPostfix(濁音相互表, 濁点記号.結合, 濁点の仲間);
}

function 半濁点適用() {
  if (shiftLayerOn()) {
    単独記号挿入(半濁点記号.単独);
    return;
  }
  applyPostfix(半濁音相互表, 半濁点記号.結合, 濁点の仲間);
}

function 小書き適用() {
  applyPostfix(小書き相互表);
}

updateKeyLabels();
updateModeToggleLabel();
updateWidthToggleLabel();
updateShiftKey();
