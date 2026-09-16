// かなキーボード共通データ。
const 母音 = "aiueo";

const 五十音表 = {
  hiragana: {
    a: ["あ", "い", "う", "え", "お"],
    k: ["か", "き", "く", "け", "こ"],
    s: ["さ", "し", "す", "せ", "そ"],
    t: ["た", "ち", "つ", "て", "と"],
    n: ["な", "に", "ぬ", "ね", "の"],
    h: ["は", "ひ", "ふ", "へ", "ほ"],
    m: ["ま", "み", "む", "め", "も"],
    y: ["や", null, "ゆ", "𛀁", "よ"], // や行え段
    r: ["ら", "り", "る", "れ", "ろ"],
    w: ["わ", "ゐ", "𛄟", "ゑ", "を"], // わ行う段
    g: ["が", "ぎ", "ぐ", "げ", "ご"],
    z: ["ざ", "じ", "ず", "ぜ", "ぞ"],
    d: ["だ", "ぢ", "づ", "で", "ど"],
    b: ["ば", "び", "ぶ", "べ", "ぼ"],
    p: ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
    v: [null, null, "ゔ", null, null],
  },
  katakana: {
    a: ["ア", "イ", "ウ", "エ", "オ"],
    k: ["カ", "キ", "ク", "ケ", "コ"],
    s: ["サ", "シ", "ス", "セ", "ソ"],
    t: ["タ", "チ", "ツ", "テ", "ト"],
    n: ["ナ", "ニ", "ヌ", "ネ", "ノ"],
    h: ["ハ", "ヒ", "フ", "ヘ", "ホ"],
    m: ["マ", "ミ", "ム", "メ", "モ"],
    y: ["ヤ", "𛄠", "ユ", "𛄡", "ヨ"], // や行い・え段
    r: ["ラ", "リ", "ル", "レ", "ロ"],
    w: ["ワ", "ヰ", "𛄢", "ヱ", "ヲ"], // わ行う段
    g: ["ガ", "ギ", "グ", "ゲ", "ゴ"],
    z: ["ザ", "ジ", "ズ", "ゼ", "ゾ"],
    d: ["ダ", "ヂ", "ヅ", "デ", "ド"],
    b: ["バ", "ビ", "ブ", "ベ", "ボ"],
    p: ["パ", "ピ", "プ", "ペ", "ポ"],
    v: [null, null, "ヴ", null, null],
    vw: ["ヷ", "ヸ", null, "ヹ", "ヺ"],
  },
};

const 小書き表 = {
  hiragana: {
    a: ["ぁ", "ぃ", "ぅ", "ぇ", "ぉ"],
    k: ["ゕ", null, null, "ゖ", "𛄲"], // 小書きか・け・こ
    t: [null, null, "っ", null, null],
    y: ["ゃ", null, "ゅ", null, "ょ"],
    w: ["ゎ", "𛅐", null, "𛅑", "𛅒"], // 小書きわ・ゐ・ゑ・を
  },
  katakana: {
    a: ["ァ", "ィ", "ゥ", "ェ", "ォ"],
    k: ["ヵ", null, "ㇰ", "ヶ", "𛅕"], // 小書きカ・ク・ケ・コ
    s: [null, "ㇱ", "ㇲ", null, null], // 小書きシ・ス
    t: [null, null, "ッ", null, "ㇳ"], // 小書きツ・ト
    n: [null, null, "ㇴ", null, null], // 小書きヌ
    h: ["ㇵ", "ㇶ", "ㇷ", "ㇸ", "ㇹ"], // 小書きハ行
    m: [null, null, "ㇺ", null, null], // 小書きム
    y: ["ャ", null, "ュ", null, "ョ"],
    r: ["ㇻ", "ㇼ", "ㇽ", "ㇾ", "ㇿ"], // 小書きラ行
    w: ["ヮ", "𛅤", null, "𛅥", "𛅦"], // 小書きワ・ヰ・ヱ・ヲ
  },
};

const 撥音表 = { hiragana: "ん", katakana: "ン" };
const 小書き撥音表 = { hiragana: null, katakana: "𛅧" }; // 小書きン

// 清音の行と濁音の行の対。
const 濁点行対 = {
  hiragana: [["a", "v"], ["k", "g"], ["s", "z"], ["t", "d"], ["h", "b"]],
  katakana: [["a", "v"], ["k", "g"], ["s", "z"], ["t", "d"], ["h", "b"], ["w", "vw"]],
};

const 半濁点行対 = {
  hiragana: [["h", "p"]],
  katakana: [["h", "p"]],
};

// U+FF61〜U+FF9Fの半角カタカナ・和文記号。
const 半角カタカナ一覧 = "｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ";
const 半角カタカナ対応表 = {};

for (const halfwidth of 半角カタカナ一覧) {
  半角カタカナ対応表[halfwidth.normalize("NFKC")] = halfwidth;
}

for (const halfwidth of 半角カタカナ一覧.slice(0, -2)) {
  for (const mark of ["ﾞ", "ﾟ"]) {
    const fullwidth = (halfwidth + mark).normalize("NFKC");
    if ([...fullwidth].length === 1) {
      半角カタカナ対応表[fullwidth] = halfwidth + mark;
    }
  }
}

半角カタカナ対応表["゛"] = "ﾞ";
半角カタカナ対応表["゜"] = "ﾟ";

function 半角カタカナ化(value, strict = false) {
  let converted = "";
  for (const character of value) {
    const halfwidth = 半角カタカナ対応表[character];
    if (!halfwidth) {
      if (strict) return null;
      converted += character;
    } else {
      converted += halfwidth;
    }
  }
  return converted;
}

function 全角英数化(value) {
  return Array.from(value, (character) => {
    if (character === " ") return "　";
    const codepoint = character.codePointAt(0);
    if (codepoint >= 0x21 && codepoint <= 0x7e) {
      return String.fromCodePoint(codepoint + 0xfee0);
    }
    return character;
  }).join("");
}
