function insertLogic(value1, insertChar, button) {
  if (母音.includes(button.textContent)) {
    if (子音文字.includes(value1.substring(value1.length - 2))) {
      const C = value1.substring(value1.length - 2);
      const V = button.textContent;
      const match = combinations.find(
        (combo) => combo.consonant.includes(C) && combo.vowel === V
      );
      if (match) {
        insertChar = match.char;
        value1 = value1.slice(0, -2);
      } else {
        console.warn("変換に失敗しました。一致する組み合わせがありません");
        insertChar = "";
      }
    } else {
      //子音後以外で母音を押しても何も起きない
      insertChar = "";
    }
  } else {
    //負荷点
    if (負荷点.includes(button.textContent)) {
      if (子音文字.includes(value1.substring(value1.length - 2))) {
        const target = value1.substring(value1.length - 2);
        const 負荷点 = button.textContent;
        const match = combinations.find(
          (combo) => combo.consonant.includes(target) && combo.vowel === 負荷点
        );
        if (match) {
          insertChar = match.char;
          value1 = value1.slice(0, -2);
        } else {
          console.warn("変換に失敗しました。一致する組み合わせがありません");
          insertChar = "";
        }
      } else {
        //子音後以外で負荷点を押しても何も起きない
        insertChar = "";
      }
    }
  }
  const firstHalf = value1 + insertChar;
  return firstHalf;
}

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
