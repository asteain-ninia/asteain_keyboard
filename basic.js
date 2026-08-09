const textarea = document.getElementById("textarea");
const buttons = document.querySelectorAll(".button");

// 画面上のキーボードだけで入力するモード（スマホ表示など）かどうか。
// このモードでは textarea が readonly なのでフォーカスを戻しても
// OSのソフトウェアキーボードは開かない。キャレットを見せるために戻すが、
// iOS が要素を画面内に入れようとするスクロールだけは抑止する。
function isCustomInputMode() {
  return document.documentElement.dataset.kbInput === "custom";
}

function refocusTextarea() {
  if (isCustomInputMode()) {
    try {
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.focus();
    }
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
    let insertChar = button.textContent;
    const value1 = textarea.value.substr(0, textarea.selectionStart);
    const value2 = textarea.value.substr(textarea.selectionEnd);

    const firstHalf = insertLogic(value1, insertChar, button);
    textarea.value = firstHalf + value2;

    textarea.selectionStart = textarea.selectionEnd = firstHalf.length;
    refocusTextarea(); // テキストエリアにフォーカスを当てる
  });
});

function toggleTextOrientation() {
  const textArea = document.getElementById("textarea");
  textArea.classList.toggle("vertical-text");
  const button = document.getElementById("toggleVrtAndHoriz");
  if (button.textContent === "横書き切り替え") {
    button.textContent = "縦書き切り替え";
  } else {
    button.textContent = "横書き切り替え";
  }
}

function space() {
  let value1 = textarea.value.substr(0, textarea.selectionStart);
  const value2 = textarea.value.substr(textarea.selectionEnd);

  textarea.value = value1 + " " + value2;

  textarea.selectionStart = textarea.selectionEnd = value1.length + 1;
  refocusTextarea();
}

function backspace() {
  let value1 = textarea.value.substr(0, textarea.selectionStart);
  const value2 = textarea.value.substr(textarea.selectionEnd);

  if (
    (55296 <= value1.codePointAt(value1.length - 1) &&
      value1.codePointAt(value1.length - 1) <= 56319) ||
    (56320 <= value1.codePointAt(value1.length - 1) &&
      value1.codePointAt(value1.length - 1) <= 57343)
    // サロゲートペアを使う文字かどうかを判定
  ) {
    textarea.value = value1.slice(0, -2) + value2;
    textarea.selectionStart = textarea.selectionEnd = value1.length - 2;
  } else {
    textarea.value = value1.slice(0, -1) + value2;
    textarea.selectionStart = textarea.selectionEnd = value1.length - 1;
  }

  refocusTextarea();
}

function enter() {
  let value1 = textarea.value.substr(0, textarea.selectionStart);
  const value2 = textarea.value.substr(textarea.selectionEnd);

  textarea.value = value1 + "\n" + value2;

  textarea.selectionStart = textarea.selectionEnd = value1.length + 1;
  refocusTextarea();
}
