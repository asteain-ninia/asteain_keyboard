// 完全音節文字 (行×段の表で全音節を並べる文字体系) のキーボード共通の仕組み。
// かな文字が最初の利用者で、刻印体アソーグ文字などが将来の利用者。
// 基底字+字上符の合成系 (compose.js) と対をなす。
//
// ページ側との契約:
//   - キーは keyboardRow の行に並び、挿入文字はラベル (textContent) そのもの
//     (space/Enter/Tab は刻印と入力文字が違うので value 属性に入力文字を持つ。basic.js 参照)
//   - 格子の位置は機能キー (.functionButton) を除いた .button の並び順で数える
//   - ページは updateKeyLabels() を定義する (モードに応じて全キーのラベルを描き直す)
//   - Shift キーは id="shiftKey"、CapsLock キーは id="capsLockKey"

// Shift は1回限りの層、CapsLock はそのロック。
let shiftOn = false;
let capsOn = false;

function shiftLayerOn() {
  return shiftOn || capsOn;
}

function insertLogic(value1, insertChar, button) {
  // 挿入する文字はキーのラベルそのもの。Shift はどのキーの入力でも1回で消費する。
  consumeKeyboardShift();
  return value1 + insertChar;
}

function updateToggleKeyVisual(id, on) {
  const button = document.getElementById(id);
  if (!button) return;
  button.classList.toggle("key-active", on);
  button.setAttribute("aria-pressed", String(on));
}

function updateShiftKey() {
  updateToggleKeyVisual("shiftKey", shiftOn);
  updateToggleKeyVisual("capsLockKey", capsOn);
}

function isKeyboardShiftActive() {
  return shiftOn;
}

function consumeKeyboardShift() {
  if (!shiftOn) return;
  shiftOn = false;
  updateKeyLabels();
  updateShiftKey();
}

function Shift() {
  shiftOn = !shiftOn;
  updateKeyLabels();
  updateShiftKey();
}

function CapsLock() {
  capsOn = !capsOn;
  updateKeyLabels();
  updateShiftKey();
}

// 音節表の格子を keyboardRow の行位置から描く。
//   列の並び: 行の先頭から数えた列キーの配列 (かな: ["w", "r", ... , "a"])
//   表: 表[列キー][段] が文字。無い枡は null か列ごと欠落
//   開始行: 格子が始まる keyboardRow の添字 (ラベル行の分だけずらす)
//   変換: 表示直前の文字変換 (半角ｶﾅ化など。省略可)
function renderSyllabaryGrid(列の並び, 表, 段数, 開始行, 変換) {
  const keyboardRows = document.querySelectorAll(".keyboardRow");
  for (let 段 = 0; 段 < 段数; 段++) {
    const keys = keyboardRows[開始行 + 段].querySelectorAll(".button:not(.functionButton)");
    for (let 列 = 0; 列 < 列の並び.length; 列++) {
      const 列データ = 表[列の並び[列]];
      let 文字 = "";
      if (列データ && 列データ[段]) 文字 = 列データ[段];
      if (文字 && 変換) 文字 = 変換(文字);
      setSyllabaryKeyLabel(keys[列], 文字);
    }
  }
}

// 現在のモードに文字が無いキーは、位置を保ったまま隠して押せなくする。
function setSyllabaryKeyLabel(key, 文字) {
  let next = "";
  if (typeof 文字 === "string") next = 文字;
  key.textContent = next;
  const unavailable = next.length === 0;
  key.disabled = unavailable;
  key.classList.toggle("kana-unavailable", unavailable);
  key.setAttribute("aria-hidden", String(unavailable));
}

// 直前の1文字をサロゲートペアごと取り出す。
function lastCodePointOf(value) {
  const code = value.charCodeAt(value.length - 1);
  if (code >= 0xdc00 && code <= 0xdfff && value.length >= 2) return value.slice(-2);
  return value.slice(-1);
}

// 変換表に逆方向の対も足して、押すたびに行き来できるようにする。
function invertConversionMap(map) {
  const out = { ...map };
  for (const [base, converted] of Object.entries(map)) {
    out[converted] = base;
  }
  return out;
}

// 直前の1文字を表で置き換える後置修飾 (濁点・小書きなど)。
//   結合記号: 表に無い字へそのまま重ねる結合記号 (省略可)
//   除外集合: 結合記号 を適用しない文字の Set (省略可)
function applyPostfix(map, 結合記号, 除外集合) {
  const textarea = document.getElementById("textarea");
  const pos = textarea.selectionStart;
  const before = textarea.value.slice(0, pos);
  const after = textarea.value.slice(pos);
  if (!before) return;

  const lastChar = lastCodePointOf(before);
  const converted = map[lastChar];
  let newBefore;
  if (converted) {
    newBefore = before.slice(0, before.length - lastChar.length) + converted;
  } else if (結合記号 && !(除外集合 && 除外集合.has(lastChar))) {
    newBefore = before + 結合記号;
  } else {
    return;
  }

  textarea.value = newBefore + after;
  textarea.selectionStart = textarea.selectionEnd = newBefore.length;
  refocusTextarea();
}
