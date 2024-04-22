function insertLogic(value1, insertChar, button) {
  if (
    長音符.includes(button.textContent) ||
    ウムラウト.includes(button.textContent)
  ) {
    if (
      基本字母.includes(value1.substring(value1.length - 2)) ||
      長音符付き字母.includes(value1.substring(value1.length - 2)) ||
      ウムラウト付き字母.includes(value1.substring(value1.length - 2)) ||
      ウムラウト長音付き字母.includes(value1.substring(value1.length - 2))
    ) {
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
      insertChar = "";
    }
  }

  const firstHalf = value1 + insertChar;
  return firstHalf;
}
