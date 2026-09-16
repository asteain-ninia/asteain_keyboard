// QWERTY・五十音キーボード共通の編集キー。
// 利用ページとの契約: isKeyboardShiftActive() / consumeKeyboardShift() /
// updateToggleKeyVisual() を必ず定義する (かなページは syllabary.js が、
// QWERTY は romaji_keyboard.js が持つ)。
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

document.querySelectorAll(".button").forEach((button) => {
  button.addEventListener("click", () => {
    if (!insertModeOvertype) return;
    const textArea = document.getElementById("textarea");
    if (textArea.selectionStart !== textArea.selectionEnd) return;
    const value = textArea.value;
    const pos = textArea.selectionEnd;
    const end = nextCaretIndex(value, pos);
    if (end === pos) return;
    textArea.setSelectionRange(pos, end);
  });
});
