const textarea = document.getElementById("textarea");
const buttons = document.querySelectorAll(".button");

// テキストエリアからフォーカスが外れた際、再びフォーカスを当てる
textarea.addEventListener("blur", () => textarea.focus());

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    let insertChar = button.textContent;
    const value1 = textarea.value.substr(0, textarea.selectionStart);
    const value2 = textarea.value.substr(textarea.selectionEnd);

    const firstHalf = insertLogic(value1, insertChar, button);
    textarea.value = firstHalf + value2;

    textarea.selectionStart = textarea.selectionEnd = firstHalf.length;
    textarea.focus(); // テキストエリアにフォーカスを当てる
  });
});

function space() {
  let value1 = textarea.value.substr(0, textarea.selectionStart);
  const value2 = textarea.value.substr(textarea.selectionEnd);

  textarea.value = value1 + " " + value2;

  textarea.selectionStart = textarea.selectionEnd = value1.length + 1;
  textarea.focus();
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

  textarea.focus();
}

function enter() {
  let value1 = textarea.value.substr(0, textarea.selectionStart);
  const value2 = textarea.value.substr(textarea.selectionEnd);

  textarea.value = value1 + "\n" + value2;

  textarea.selectionStart = textarea.selectionEnd = value1.length + 1;
  textarea.focus();
}
