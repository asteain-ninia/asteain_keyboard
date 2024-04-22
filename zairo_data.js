const 基本字母 = [
  String.fromCodePoint(994000),
  String.fromCodePoint(994001),
  String.fromCodePoint(994002),
  String.fromCodePoint(994003),
  String.fromCodePoint(994004),
  String.fromCodePoint(994005),
  String.fromCodePoint(994006),
  String.fromCodePoint(994007),
  String.fromCodePoint(994008),
  String.fromCodePoint(994009),
  String.fromCodePoint(994010),
  String.fromCodePoint(994011),
  String.fromCodePoint(994012),
  String.fromCodePoint(994013),
  String.fromCodePoint(994014),
  String.fromCodePoint(994015),
  String.fromCodePoint(994016),
  String.fromCodePoint(994017),
  String.fromCodePoint(994018),
  String.fromCodePoint(994019),
  String.fromCodePoint(994020),
  String.fromCodePoint(994021),
  String.fromCodePoint(994022),
  String.fromCodePoint(994023),
  String.fromCodePoint(994024),
  String.fromCodePoint(994025),
  String.fromCodePoint(994026),
  String.fromCodePoint(994027),
  String.fromCodePoint(994028),
  String.fromCodePoint(994036),
  String.fromCodePoint(994037),
  String.fromCodePoint(994038),
  String.fromCodePoint(994039),
];

const 長音符 = String.fromCodePoint(994224);

const 長音符付き字母 = [
  String.fromCodePoint(994225),
  String.fromCodePoint(994226),
  String.fromCodePoint(994227),
  String.fromCodePoint(994228),
  String.fromCodePoint(994229),
  String.fromCodePoint(994230),
  String.fromCodePoint(994231),
  String.fromCodePoint(994232),
  String.fromCodePoint(994233),
  String.fromCodePoint(994234),
  String.fromCodePoint(994235),
  String.fromCodePoint(994236),
  String.fromCodePoint(994237),
  String.fromCodePoint(994238),
  String.fromCodePoint(994239),
  String.fromCodePoint(994240),
  String.fromCodePoint(994241),
  String.fromCodePoint(994242),
  String.fromCodePoint(994243),
  String.fromCodePoint(994244),
  String.fromCodePoint(994245),
  String.fromCodePoint(994246),
  String.fromCodePoint(994247),
  String.fromCodePoint(994248),
  String.fromCodePoint(994249),
  String.fromCodePoint(994250),
  String.fromCodePoint(994251),
  String.fromCodePoint(994252),
  String.fromCodePoint(994253),
  String.fromCodePoint(994254),
  String.fromCodePoint(994255),
  String.fromCodePoint(994256),
  String.fromCodePoint(994257),
];

let combinations = [];

for (let i = 0; i < 基本字母.length; i++) {
  combinations.push(
    {
      consonant: 基本字母[i],
      vowel: 長音符,
      char: 長音符付き字母[i],
    },
    {
      consonant: 長音符付き字母[i],
      vowel: 長音符,
      char: 基本字母[i],
    }
  );
}

母音 = [
  String.fromCodePoint(994000),
  String.fromCodePoint(994001),
  String.fromCodePoint(994002),
  String.fromCodePoint(994003),
  String.fromCodePoint(994004),
  String.fromCodePoint(994005),
];

ウムラウト = String.fromCodePoint(994258);
ウムラウト長音 = String.fromCodePoint(994265);

ウムラウト付き字母 = [
  String.fromCodePoint(994259),
  String.fromCodePoint(994260),
  String.fromCodePoint(994261),
  String.fromCodePoint(994262),
  String.fromCodePoint(994263),
  String.fromCodePoint(994264),
];

ウムラウト長音付き字母 = [
  String.fromCodePoint(994266),
  String.fromCodePoint(994267),
  String.fromCodePoint(994268),
  String.fromCodePoint(994269),
  String.fromCodePoint(994270),
  String.fromCodePoint(994271),
];

長音付き母音 = [
  String.fromCodePoint(994225),
  String.fromCodePoint(994226),
  String.fromCodePoint(994227),
  String.fromCodePoint(994228),
  String.fromCodePoint(994229),
  String.fromCodePoint(994230),
];

for (let i = 0; i < 母音.length; i++) {
  combinations.push(
    {
      consonant: 母音[i],
      vowel: ウムラウト,
      char: ウムラウト付き字母[i],
    },
    {
      consonant: ウムラウト付き字母[i],
      vowel: ウムラウト,
      char: 母音[i],
    },
    {
      consonant: 母音[i],
      vowel: ウムラウト長音,
      char: ウムラウト付き字母[i],
    },
    {
      consonant: ウムラウト付き字母[i],
      vowel: ウムラウト長音,
      char: 母音[i],
    },

    //以下なぜかうまくうごかない
    {
      consonant: 長音付き母音[i],
      vowel: ウムラウト,
      char: ウムラウト長音付き字母[i],
    },
    {
      consonant: ウムラウト長音付き字母[i],
      vowel: ウムラウト,
      char: 長音付き母音[i],
    },
    {
      consonant: ウムラウト付き字母[i],
      vowel: 長音符,
      char: ウムラウト長音付き字母[i],
    },
    {
      consonant: ウムラウト長音付き字母[i],
      vowel: 長音符,
      char: ウムラウト付き字母[i],
    }
  );
}
