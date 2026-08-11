//アソーグ文字キーボードの入力ロジック（共通の compose.js から生成）
//母音でも負荷点でも、子音字の直後なら combinations 表で音節グリフに合成する
const insertLogic = makeComposeInsertLogic([母音, 負荷点], [子音文字], combinations);
