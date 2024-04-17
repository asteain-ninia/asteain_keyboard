const 母音 = [
  String.fromCodePoint(994586),
  String.fromCodePoint(994587),
  String.fromCodePoint(994588),
  String.fromCodePoint(994589),
  String.fromCodePoint(994590),
  String.fromCodePoint(994591),
  String.fromCodePoint(994592),
  String.fromCodePoint(994593),
  String.fromCodePoint(994594),
  String.fromCodePoint(994595),
  String.fromCodePoint(994596),
  String.fromCodePoint(994597),
  String.fromCodePoint(994623),
  String.fromCodePoint(994624),
  String.fromCodePoint(994625),
  String.fromCodePoint(994626),
  String.fromCodePoint(994627),
  String.fromCodePoint(994628),
  String.fromCodePoint(994629),
  String.fromCodePoint(994630),
  String.fromCodePoint(994631),
  String.fromCodePoint(994632),
  String.fromCodePoint(994633),
  String.fromCodePoint(994634),
];

const アクセント = String.fromCodePoint(994640);

const アクセント付き母音 = [
  String.fromCodePoint(994644),
  String.fromCodePoint(994645),
  String.fromCodePoint(994646),
  String.fromCodePoint(994647),
  String.fromCodePoint(994648),
  String.fromCodePoint(994649),
  String.fromCodePoint(994650),
  String.fromCodePoint(994651),
  String.fromCodePoint(994652),
  String.fromCodePoint(994653),
  String.fromCodePoint(994654),
  String.fromCodePoint(994655),
  String.fromCodePoint(994656),
  String.fromCodePoint(994657),
  String.fromCodePoint(994658),
  String.fromCodePoint(994659),
  String.fromCodePoint(994660),
  String.fromCodePoint(994661),
  String.fromCodePoint(994662),
  String.fromCodePoint(994663),
  String.fromCodePoint(994664),
  String.fromCodePoint(994665),
  String.fromCodePoint(994666),
  String.fromCodePoint(994667),
];

let combinations = [];

for (let i = 0; i < 母音.length; i++) {
  combinations.push({
    consonant: 母音[i],
    vowel: アクセント,
    char: アクセント付き母音[i],
  });
}
