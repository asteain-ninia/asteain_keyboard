"use strict";
// プラグインのメイン関数
function main() {
  const selection = figma.currentPage.selection;
  if (selection[0]) {
    for (let i = 0; i <= selection.length; i++) {
      const group = selection[i];
      const unionName = group.name;
      let unionized;
      if (group.type === "GROUP") {
        unionized = figma.union(group.children, group.parent);
      } else {
        const rect = figma.createRectangle();
        rect.x = group.x;
        rect.y = group.y;
        rect.resize(1, 1);
        unionized = figma.union([group, rect], group.parent);
        rect.remove();
      }
      unionized.fills = [
        { type: "SOLID", color: figma.util.rgb("#000000"), opacity: 1 },
      ];
      unionized.name = unionName;
      console.log(unionized);
      figma.flatten([unionized], unionized.parent);
    }

    figma.closePlugin("すべての文字を平坦化しました。");
  } else {
    figma.closePlugin("選択がありません");
  }
}
// プラグインを実行する
main();
