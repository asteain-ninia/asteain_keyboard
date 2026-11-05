//デーレ文字キーボード共通の入力ロジック。
//正文字版と小文字版はコードポイントの基準値が違うだけなので、
//基準値を渡して insertLogic を生成する。
//変換器 (derleConverter_small.html) も繰り返し記号の規則を揃えるためにこれを使う。
//  字母開始: 素の字母26字の先頭。発音線付き26字がその直後に続く
//  発音線切替字: 発音線トグルで +7/-7 し合う記号の若い方
//  繰り返し記号: 同じ字母の連続を置き換える記号

//繰り返し記号の判定だけを取り出したもの。
//baseCode = 直前の繰り返し記号を読み飛ばした先の文字のコードポイント (無ければ 0)。
//それと同じ字母を入れようとしていたら繰り返し記号を、そうでなければ insertChar をそのまま返す。
//数字・記号の連続は対象外。
//変換器は baseCode を自分で覚えておけるので、文字列を遡らずにこれだけを呼ぶ。
function derleRepeatChar(baseCode, insertChar, 字母開始, 繰り返し記号) {
  const 字母末尾 = 字母開始 + 51;
  if (baseCode >= 字母開始 && baseCode <= 字母末尾 && baseCode == insertChar.codePointAt()) {
    return String.fromCodePoint(繰り返し記号);
  }
  return insertChar;
}

function makeDerleInsertLogic(字母開始, 発音線切替字, 繰り返し記号) {
  const 字母末尾 = 字母開始 + 51;
  return function insertLogic(value1, insertChar, button) {
    const charCode = value1.substring(value1.length - 2).codePointAt();
    if (insertChar == "󲿁") {
      //発音線
      if (charCode >= 字母開始 && charCode <= 字母開始 + 25) {
        insertChar = String.fromCodePoint(charCode + 26);
        value1 = value1.slice(0, -2);
      } else if (charCode >= 字母開始 + 26 && charCode <= 字母末尾) {
        insertChar = String.fromCodePoint(charCode - 26);
        value1 = value1.slice(0, -2);
      } else if (charCode == 発音線切替字) {
        insertChar = String.fromCodePoint(charCode + 7);
        value1 = value1.slice(0, -2);
      } else if (charCode == 発音線切替字 + 7) {
        insertChar = String.fromCodePoint(charCode - 7);
        value1 = value1.slice(0, -2);
      } else {
        //発音線がつかない文字の後で発音線を押しても何も起きない
        insertChar = "";
      }
    }
    //繰り返し記号: 直前の繰り返し記号を読み飛ばした先の文字と
    //同じ字母を入力したら、繰り返し記号にする（あああ → あ〻〻 の要領）
    //数字・記号の連続は対象外
    let back = value1.length;
    while (back >= 2 && value1.codePointAt(back - 2) == 繰り返し記号) {
      back -= 2;
    }
    let baseCode = 0;
    if (back >= 2) {
      baseCode = value1.codePointAt(back - 2);
    }
    insertChar = derleRepeatChar(baseCode, insertChar, 字母開始, 繰り返し記号);
    return value1 + insertChar;
  };
}
