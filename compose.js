//合成キーボード（ashogu・zairo・queso）共通の入力ロジック。
//「トリガー字（母音・負荷点・長音符・アクセントなど）が押されたら、
//直前の文字との組み合わせを combinations 表から探して置き換える」を生成する。
//  トリガー群: 合成を起動する文字集合の配列（各要素は配列でも単一文字の文字列でも可）
//  基底群: 合成対象になれる直前文字の集合の配列
//  組み合わせ表: { consonant, vowel, char } の配列
function makeComposeInsertLogic(トリガー群, 基底群, 組み合わせ表) {
  return function insertLogic(value1, insertChar, button) {
    const 押下 = button.textContent;
    if (トリガー群.some((t) => t.includes(押下))) {
      const C = value1.substring(value1.length - 2);
      if (基底群.some((g) => g.includes(C))) {
        const match = 組み合わせ表.find(
          (combo) => combo.consonant.includes(C) && combo.vowel === 押下
        );
        if (match) {
          insertChar = match.char;
          value1 = value1.slice(0, -2);
        } else {
          console.warn("変換に失敗しました。一致する組み合わせがありません");
          insertChar = "";
        }
      } else {
        //基底文字の直後以外でトリガー字を押しても何も起きない
        insertChar = "";
      }
    }
    return value1 + insertChar;
  };
}
