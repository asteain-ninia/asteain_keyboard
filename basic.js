const textarea = document.getElementById("textarea");
const buttons = document.querySelectorAll(".button");

// 画面上のキーボードだけで入力するモード（スマホ表示など）かどうか。
// このモードではOSのソフトウェアキーボードを出さずにフォーカスを戻す必要があり、
// その手当てはページ側が window.kbFocusTextarea として差し込む。
function isCustomInputMode() {
  return document.documentElement.dataset.kbInput === "custom";
}

function refocusTextarea() {
  if (isCustomInputMode() && typeof window.kbFocusTextarea === "function") {
    window.kbFocusTextarea();
    return;
  }
  textarea.focus();
}

// テキストエリアからフォーカスが外れた際、再びフォーカスを当てる。
// ただしカスタム入力モードでは他のボタンを一切押せなくなるので奪い返さない
// （入力操作のたびに refocusTextarea() が呼ばれるので実害はない）。
textarea.addEventListener("blur", () => {
  if (isCustomInputMode()) return;
  textarea.focus();
});

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    // 入力文字はキーの刻印 (textContent) そのもの。刻印と入力文字が違うキー
    // (space・Enter・Tab) だけ value 属性に入力文字を持つ。
    // ここで読んだ文字を insertLogic に渡す。insertLogic の中で刻印を読み直さないこと
    // (かな文字の space は insertLogic 中の Shift 消費で value が描き直されるため)。
    let insertChar = button.textContent;
    if (button.value) {
      insertChar = button.value;
    }
    const value1 = textarea.value.substr(0, textarea.selectionStart);
    const value2 = textarea.value.substr(textarea.selectionEnd);

    // insertLogic はページ側が必ず定義する契約 (value1 + 挿入文字列を返す)。
    const firstHalf = insertLogic(value1, insertChar, button);
    textarea.value = firstHalf + value2;

    textarea.selectionStart = textarea.selectionEnd = firstHalf.length;
    refocusTextarea(); // テキストエリアにフォーカスを当てる
  });
});

function toggleTextOrientation() {
  const textArea = document.getElementById("textarea");
  const vertical = textArea.classList.toggle("vertical-text");
  const button = document.getElementById("toggleVrtAndHoriz");
  if (vertical) {
    button.textContent = "横書き切り替え";
  } else {
    button.textContent = "縦書き切り替え";
  }
}

// キャレット位置に文字列を挿入する (ボタン経由でない挿入用。かな文字の単独濁点など)。
function insertTextAtCaret(text) {
  const value1 = textarea.value.substr(0, textarea.selectionStart);
  const value2 = textarea.value.substr(textarea.selectionEnd);
  textarea.value = value1 + text + value2;
  textarea.selectionStart = textarea.selectionEnd = value1.length + text.length;
  refocusTextarea();
}

function backspace() {
  const value1 = textarea.value.substr(0, textarea.selectionStart);
  const value2 = textarea.value.substr(textarea.selectionEnd);

  // 末尾がサロゲートペアを使う文字なら2単位まとめて消す。
  const code = value1.charCodeAt(value1.length - 1);
  let dropLength = 1;
  if (code >= 0xd800 && code <= 0xdfff) {
    dropLength = 2;
  }

  textarea.value = value1.slice(0, -dropLength) + value2;
  textarea.selectionStart = textarea.selectionEnd = value1.length - dropLength;
  refocusTextarea();
}
