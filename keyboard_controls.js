// QWERTY・五十音キーボード共通の編集キー。
// 利用ページとの契約: isKeyboardShiftActive() / consumeKeyboardShift() /
// updateToggleKeyVisual() を必ず定義する (かなページは syllabary.js が、
// QWERTY は romaji_keyboard.js が持つ)。変換待ちの入力を持つページは
// pendingInputLength() も定義する (ローマ字入力の romaji_keyboard.js。無ければ常に確定扱い)。
function deleteForward() {
  const textArea = document.getElementById("textarea");
  const value = textArea.value;
  const start = textArea.selectionStart;
  let end = textArea.selectionEnd;
  if (start === end) {
    end = nextCaretIndex(value, end);
  }
  textArea.value = value.slice(0, start) + value.slice(end);
  textArea.selectionStart = textArea.selectionEnd = start;
  refocusTextarea();
}

function prevCaretIndex(value, pos) {
  if (pos <= 0) return 0;
  const code = value.charCodeAt(pos - 1);
  if (code >= 0xdc00 && code <= 0xdfff && pos >= 2) return pos - 2;
  return pos - 1;
}

function nextCaretIndex(value, pos) {
  if (pos >= value.length) return value.length;
  const code = value.charCodeAt(pos);
  if (code >= 0xd800 && code <= 0xdbff && pos + 2 <= value.length) return pos + 2;
  return pos + 1;
}

function caretLineStart(value, pos) {
  return value.lastIndexOf("\n", pos - 1) + 1;
}

function caretLineEnd(value, pos) {
  const found = value.indexOf("\n", pos);
  if (found === -1) return value.length;
  return found;
}

function caretColumn(value, start, pos) {
  let count = 0;
  for (let i = start; i < pos; count++) {
    i = nextCaretIndex(value, i);
  }
  return count;
}

function caretAdvanceBy(value, from, count, limit) {
  let i = from;
  while (count > 0 && i < limit) {
    i = nextCaretIndex(value, i);
    count -= 1;
  }
  return Math.min(i, limit);
}

function verticalCaretIndex(value, pos, step) {
  const start = caretLineStart(value, pos);
  const column = caretColumn(value, start, pos);
  if (step < 0) {
    if (start === 0) return 0;
    const prevStart = value.lastIndexOf("\n", start - 2) + 1;
    return caretAdvanceBy(value, prevStart, column, start - 1);
  }
  const end = caretLineEnd(value, pos);
  if (end >= value.length) return value.length;
  const nextStart = end + 1;
  return caretAdvanceBy(value, nextStart, column, caretLineEnd(value, nextStart));
}

function selectionFocus(textArea) {
  if (textArea.selectionStart === textArea.selectionEnd) return textArea.selectionEnd;
  if (textArea.selectionDirection === "backward") {
    return textArea.selectionStart;
  }
  return textArea.selectionEnd;
}

function selectionAnchor(textArea) {
  if (textArea.selectionStart === textArea.selectionEnd) return textArea.selectionStart;
  if (textArea.selectionDirection === "backward") {
    return textArea.selectionEnd;
  }
  return textArea.selectionStart;
}

function finishNavigation(textArea, pos, extendSelection) {
  textArea.focus();
  if (!extendSelection) {
    textArea.setSelectionRange(pos, pos);
    return;
  }

  const anchor = selectionAnchor(textArea);
  if (pos < anchor) {
    textArea.setSelectionRange(pos, anchor, "backward");
  } else {
    textArea.setSelectionRange(anchor, pos, "forward");
  }
  consumeKeyboardShift();
}

function moveCaret(direction) {
  const textArea = document.getElementById("textarea");
  const value = textArea.value;
  const extendSelection = isKeyboardShiftActive();
  const backward = direction === "left" || direction === "up";
  let pos;
  if (extendSelection) {
    pos = selectionFocus(textArea);
  } else if (backward) {
    pos = textArea.selectionStart;
  } else {
    pos = textArea.selectionEnd;
  }

  if (direction === "left") {
    if (extendSelection || textArea.selectionStart === textArea.selectionEnd) {
      pos = prevCaretIndex(value, pos);
    }
  } else if (direction === "right") {
    if (extendSelection || textArea.selectionStart === textArea.selectionEnd) {
      pos = nextCaretIndex(value, pos);
    }
  } else {
    let step = 1;
    if (direction === "up") {
      step = -1;
    }
    pos = verticalCaretIndex(value, pos, step);
  }

  finishNavigation(textArea, pos, extendSelection);
}

function moveHome() {
  const textArea = document.getElementById("textarea");
  const extendSelection = isKeyboardShiftActive();
  let base = textArea.selectionEnd;
  if (extendSelection) {
    base = selectionFocus(textArea);
  }
  const pos = caretLineStart(textArea.value, base);
  finishNavigation(textArea, pos, extendSelection);
}

function moveEnd() {
  const textArea = document.getElementById("textarea");
  const extendSelection = isKeyboardShiftActive();
  let base = textArea.selectionEnd;
  if (extendSelection) {
    base = selectionFocus(textArea);
  }
  const pos = caretLineEnd(textArea.value, base);
  finishNavigation(textArea, pos, extendSelection);
}

const PAGE_MOVE_LINES = 5;

function pageMove(direction) {
  const textArea = document.getElementById("textarea");
  const value = textArea.value;
  const extendSelection = isKeyboardShiftActive();
  let step = 1;
  if (direction === "up") {
    step = -1;
  }
  let pos = textArea.selectionEnd;
  if (extendSelection) {
    pos = selectionFocus(textArea);
  }
  for (let i = 0; i < PAGE_MOVE_LINES; i++) {
    pos = verticalCaretIndex(value, pos, step);
  }
  finishNavigation(textArea, pos, extendSelection);
}

let insertModeOvertype = false;

function updateInsertKeyVisual() {
  updateToggleKeyVisual("insertKey", insertModeOvertype);
}

function toggleInsertMode() {
  insertModeOvertype = !insertModeOvertype;
  updateInsertKeyVisual();
}

// 半角ｶﾅの濁点・半濁点 (U+FF9E ﾞ・U+FF9F ﾟ) か。前の字と組で1字に見える (ｶﾞ ﾊﾟ)。
function isHalfwidthSoundMark(value, index) {
  const code = value.charCodeAt(index);
  return code === 0xff9e || code === 0xff9f;
}

// 上書きで1字と数える単位の次の位置。サロゲートペアと、半角ｶﾅ+ﾞ/ﾟ の組 (ｶﾞ) をまとめて進む。
function nextOvertypeIndex(value, pos) {
  let next = nextCaretIndex(value, pos);
  while (next < value.length && isHalfwidthSoundMark(value, next)) {
    next += 1;
  }
  return next;
}

// 確定済みの文字数。サロゲートペアは1字、半角ｶﾅの濁音・半濁音 (ｶﾞ) も1字と数える。
// 末尾で変換待ちのローマ字 (か を待つ k、っ を待つ xts など) はまだ確定していないので
// 数えない。その長さはページ側が pendingInputLength(text) で申告する (定義が無ければ 0)。
function committedCharCount(text) {
  let pending = 0;
  if (typeof pendingInputLength === "function") {
    pending = pendingInputLength(text);
  }
  const committed = text.slice(0, text.length - pending);
  let count = 0;
  for (let i = 0; i < committed.length; count++) {
    i = nextOvertypeIndex(committed, i);
  }
  return count;
}

// 2つの文字列に共通する先頭部分の長さ (コード単位)。サロゲートペアの途中では切らない。
function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let length = 0;
  while (length < limit && a.charCodeAt(length) === b.charCodeAt(length)) {
    length += 1;
  }
  if (length > 0) {
    const code = a.charCodeAt(length - 1);
    if (code >= 0xd800 && code <= 0xdbff) length -= 1;
  }
  return length;
}

// 上書き (Insert) モードの本体。basic.js が文字キーの入力のたびに呼ぶ契約:
//   value1 = 入力前のキャレット前、firstHalf = insertLogic が返した新しいキャレット前、
//   value2 = キャレット後、hadSelection = 範囲選択を置き換えた入力かどうか。
// 今回の入力で新たに確定した文字数ぶんだけ value2 の先頭を消して返す。
// 「次の1文字を選択してから挿入」では、k+a のように2打で1文字しか確定しないローマ字入力で
// 消しすぎる (変換待ちの k が1字、か がもう1字消す) ので、確定した数を入力後に数える。
// 数えるのは insertLogic が書き換えた末尾 (value1 と firstHalf の共通部分より後ろ) だけ。
// キャレット前に元からある英字 (IME Off で打った語・貼り付けた語) まで変換待ちと見なして
// 数えると、hello| world + a で hello の5字ぶん消してしまう。代わりに、変換されずに終わった
// 変換待ちの字 (k の後に空白など) は数えないままになり、その1字ぶん消し残す (消しすぎるよりは無害)。
// 半角ｶﾅの濁音 (ｶﾞ) は2コードポイントだが1字として数え、消す側でも ｶﾞ を組ごと1字消す
// (ga で ｶﾞ を打つと後ろを2字消す・ｶﾞ の上に打つと ﾞ だけ残る、を防ぐ)。
// 範囲選択の置き換えは選択範囲の削除で済んでいるので何も消さない。
// 行末 (改行) の先は消さない。改行を入れる入力 (Enter) はキャレットが次の行へ移るので、
// 前の行で確定した字 (変換待ちの n → ん) があっても後続とは行が違い、何も消さない。
function overtypeRemainder(value1, firstHalf, value2, hadSelection) {
  if (!insertModeOvertype || hadSelection) return value2;
  const prefix = commonPrefixLength(value1, firstHalf);
  const added = firstHalf.slice(prefix);
  const removed = value1.slice(prefix);
  if (added.includes("\n")) return value2;
  let count = committedCharCount(added) - committedCharCount(removed);
  let end = 0;
  while (count > 0 && end < value2.length && value2[end] !== "\n") {
    end = nextOvertypeIndex(value2, end);
    count -= 1;
  }
  return value2.slice(end);
}
