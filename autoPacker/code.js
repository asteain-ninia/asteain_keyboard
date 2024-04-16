"use strict";
// プラグインのメイン関数
function main() {
  // 現在の選択範囲を取得する
  const selection = figma.currentPage.selection;
  if (selection[0]) {
    for (let i = 0; i <= selection.length; i++) {
      // 対象の座標とサイズを取得する
      const group = selection[i];
      let y = Math.floor(group.y / 64) * 64;
      console.info(group.name);
      console.log(group);
      console.log(group.y);
      console.log(group.height);
      console.log(group.y + group.height);
      if (group.y > 124 && group.y < 160) {
        if (group.y + group.height === 204) {
          y = 140;
        }
      }
      // グループを包む四角形を作成する
      const rect = figma.createRectangle();
      rect.x = Math.floor(group.x / 56) * 56;
      rect.y = y;
      rect.resize(2, 64);
      // 四角形の塗りを設定する
      rect.fills = [
        { type: "SOLID", color: figma.util.rgb("#D9D9D9"), opacity: 1 },
      ];
      // 四角形をグループの中に追加する
      figma.group([group, rect], group.parent).name = group.name;
      // プラグインを終了する
    }
    figma.closePlugin("すべての文字を梱包しました。");
  } else {
    figma.closePlugin("選択がありません");
  }
}
// プラグインを実行する
main();
