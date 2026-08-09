/*
  新体アソーグ文字標準（ashogu_keyboard2）のスマホ対応。

  やっていること
    1. スマホ判定（自動 / スマホ固定 / PC 固定 を左上のボタンで切り替え、選択は保存）
    2. スマホ表示のときは textarea を readonly + inputmode="none" にして
       OS のソフトウェアキーボードが開かないようにする
       （basic.js の「blur したら focus し直す」も data-kb-input で無効化する）
    3. 画面の高さを dvh で分割し、上=入力欄 / 下=キーボード に固定する
    4. テンキーは引き出し。「123」キーを上にフリック、またはタップで開く
    5. キーの実寸を測って字面サイズを決める
    6. BackSpace の長押しリピート
*/
(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const STORAGE_KEY = "asteain-kb2-layout";
  const MODES = ["auto", "mobile", "desktop"];
  const LABELS = { auto: "自動", mobile: "スマホ", desktop: "PC" };
  const TITLES = {
    auto: "表示: 自動判定（押すとスマホ表示に固定）",
    mobile: "表示: スマホ固定（押すとPC表示に固定）",
    desktop: "表示: PC固定（押すと自動判定に戻る）",
  };

  const textarea = document.getElementById("textarea");
  const keyboard = document.querySelector(".kb2-keyboard");
  const numpad = document.getElementById("numpad");
  const numpadKey = document.getElementById("numpadKey");
  const numpadBar = document.getElementById("numpadBar");
  const numpadClose = document.getElementById("numpadClose");
  const layoutToggle = document.getElementById("layoutToggle");
  const backspaceKey = document.getElementById("backspaceKey");

  // ---------- 表示モード ----------

  const readPreference = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return MODES.includes(stored) ? stored : "auto";
    } catch (error) {
      return "auto";
    }
  };

  const writePreference = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      // プライベートモード等で保存できなくても表示自体は切り替える
    }
  };

  let preference = readPreference();

  const detectMobile = () => {
    const coarse =
      window.matchMedia &&
      (window.matchMedia("(any-pointer: coarse)").matches ||
        window.matchMedia("(any-hover: none)").matches);
    const touch = navigator.maxTouchPoints > 0;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    if ((coarse || touch) && shortSide <= 900) {
      return true;
    }
    // タッチ判定に漏れても極端に狭い窓なら縦長端末とみなす
    return window.innerWidth <= 620;
  };

  const resolveMode = () =>
    preference === "auto" ? (detectMobile() ? "mobile" : "desktop") : preference;

  /*
    OSキーボードを出さずにキャレットを見せるための仕掛け。

    OS がソフトウェアキーボードを出すかどうかは「フォーカスが当たった瞬間に
    その要素が編集可能か」だけで決まる。そこでフォーカスが移る直前に readonly を
    立て、確定した直後に外す。外した後は編集可能なのでキャレットが通常どおり
    描画され、しかしフォーカスは既に確定しているのでキーボードは出てこない。
    inputmode="none" を尊重するブラウザではそちらだけで足りるが、
    効かない環境のための二重の備えとしてこの方式を併用する。
  */
  const GUARD_RELEASE_MS = 120;
  const GUARD_FALLBACK_MS = 500;
  let guardTimer = null;

  const armKeyboardGuard = () => {
    if (!textarea) {
      return;
    }
    clearTimeout(guardTimer);
    guardTimer = null;
    textarea.setAttribute("readonly", "readonly");
  };

  const releaseKeyboardGuard = (delay) => {
    if (!textarea) {
      return;
    }
    clearTimeout(guardTimer);
    guardTimer = setTimeout(() => {
      guardTimer = null;
      if (root.dataset.kbMode === "mobile") {
        textarea.removeAttribute("readonly");
      }
    }, delay);
  };

  const focusTextareaSafely = () => {
    if (!textarea) {
      return;
    }
    if (root.dataset.kbMode !== "mobile") {
      textarea.focus();
      return;
    }
    armKeyboardGuard();
    try {
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.focus();
    }
    releaseKeyboardGuard(GUARD_RELEASE_MS);
  };

  // basic.js からはこのフックを経由してフォーカスを戻してもらう
  window.kbFocusTextarea = focusTextareaSafely;

  const suppressNativeKeyboard = (on) => {
    if (!textarea) {
      return;
    }
    if (on) {
      // 常時 readonly にはしない（キャレットが描画されなくなるため）。
      // 実際の抑止はフォーカス直前の armKeyboardGuard() が担う。
      textarea.setAttribute("inputmode", "none");
      textarea.setAttribute("autocapitalize", "off");
      textarea.setAttribute("autocorrect", "off");
      textarea.setAttribute("spellcheck", "false");
      textarea.removeAttribute("readonly");
    } else {
      clearTimeout(guardTimer);
      guardTimer = null;
      textarea.removeAttribute("readonly");
      textarea.removeAttribute("inputmode");
    }
  };

  if (textarea) {
    // 画面を直接タップされたときも、フォーカスが確定するまでは readonly にしておく
    textarea.addEventListener(
      "pointerdown",
      () => {
        if (root.dataset.kbMode !== "mobile") {
          return;
        }
        armKeyboardGuard();
        // 既にフォーカス済みで focus が発火しない場合に備えた保険
        releaseKeyboardGuard(GUARD_FALLBACK_MS);
      },
      { passive: true }
    );

    textarea.addEventListener("focus", () => {
      if (root.dataset.kbMode !== "mobile") {
        return;
      }
      releaseKeyboardGuard(GUARD_RELEASE_MS);
    });
  }

  const updateToggleLabel = () => {
    if (!layoutToggle) {
      return;
    }
    layoutToggle.textContent = LABELS[preference];
    layoutToggle.title = TITLES[preference];
    layoutToggle.setAttribute("aria-label", TITLES[preference]);
  };

  const updateViewportUnit = () => {
    body.style.setProperty("--kb-vh", window.innerHeight / 100 + "px");
  };

  // ---------- 字面サイズの実測 ----------

  const setKeyFont = (variable, selector, ratio, min, max) => {
    const sample = document.querySelector(selector);
    if (!sample) {
      return;
    }
    const w = sample.clientWidth;
    const h = sample.clientHeight;
    if (!w || !h) {
      return;
    }
    const size = Math.min(Math.max(Math.min(w, h) * ratio, min), max);
    body.style.setProperty(variable, size.toFixed(1) + "px");
  };

  const fitKeys = () => {
    if (root.dataset.kbMode !== "mobile") {
      ["--kb-key-font", "--kb-func-font", "--kb-num-font", "--kb-label-font"].forEach(
        (name) => body.style.removeProperty(name)
      );
      return;
    }
    setKeyFont("--kb-key-font", ".spacer--base .button", 0.86, 16, 46);
    setKeyFont("--kb-func-font", ".spacer--func .button", 0.86, 14, 40);
    setKeyFont("--kb-num-font", ".numpad .button", 0.72, 16, 52);
    setKeyFont("--kb-label-font", ".spacer--func .functionButton", 0.3, 9, 14);
    setKeyFont("--kb-dpad-font", ".dpad-left", 0.42, 13, 24);
  };

  // ---------- カーソル移動（十字キー） ----------

  // サロゲートペアで 1 文字を表す領域なので、必ず符号位置単位で動かす
  const prevIndex = (value, pos) => {
    if (pos <= 0) {
      return 0;
    }
    const code = value.charCodeAt(pos - 1);
    return code >= 0xdc00 && code <= 0xdfff && pos >= 2 ? pos - 2 : pos - 1;
  };

  const nextIndex = (value, pos) => {
    if (pos >= value.length) {
      return value.length;
    }
    const code = value.charCodeAt(pos);
    return code >= 0xd800 && code <= 0xdbff && pos + 2 <= value.length
      ? pos + 2
      : pos + 1;
  };

  const lineStartOf = (value, pos) => value.lastIndexOf("\n", pos - 1) + 1;

  const lineEndOf = (value, pos) => {
    const found = value.indexOf("\n", pos);
    return found === -1 ? value.length : found;
  };

  const columnOf = (value, start, pos) => {
    let count = 0;
    for (let i = start; i < pos; count++) {
      i = nextIndex(value, i);
    }
    return count;
  };

  const advanceBy = (value, from, count, limit) => {
    let i = from;
    while (count > 0 && i < limit) {
      i = nextIndex(value, i);
      count -= 1;
    }
    return Math.min(i, limit);
  };

  const verticalIndex = (value, pos, step) => {
    const start = lineStartOf(value, pos);
    const column = columnOf(value, start, pos);
    if (step < 0) {
      if (start === 0) {
        return 0; // 最初の行より上は先頭へ
      }
      const prevStart = value.lastIndexOf("\n", start - 2) + 1;
      return advanceBy(value, prevStart, column, start - 1);
    }
    const end = lineEndOf(value, pos);
    if (end >= value.length) {
      return value.length; // 最後の行より下は末尾へ
    }
    const nextStart = end + 1;
    return advanceBy(value, nextStart, column, lineEndOf(value, nextStart));
  };

  const moveCaret = (direction) => {
    if (!textarea) {
      return;
    }
    const value = textarea.value;
    const backward = direction === "left" || direction === "up";
    // 範囲選択中はまず端に畳む
    let pos = backward ? textarea.selectionStart : textarea.selectionEnd;
    if (direction === "left") {
      pos = textarea.selectionStart === textarea.selectionEnd
        ? prevIndex(value, pos)
        : pos;
    } else if (direction === "right") {
      pos = textarea.selectionStart === textarea.selectionEnd
        ? nextIndex(value, pos)
        : pos;
    } else {
      pos = verticalIndex(value, pos, direction === "up" ? -1 : 1);
    }
    // フォーカスを戻さないとキャレットが描画されず、位置が見えない
    focusTextareaSafely();
    textarea.setSelectionRange(pos, pos);
  };

  // 長押しでリピートさせる（BackSpace と十字キー用）
  const attachRepeat = (element, action) => {
    if (!element) {
      return;
    }
    let delayTimer = null;
    let repeatTimer = null;

    const stop = () => {
      clearTimeout(delayTimer);
      clearInterval(repeatTimer);
      delayTimer = null;
      repeatTimer = null;
    };

    element.addEventListener("pointerdown", () => {
      stop();
      delayTimer = setTimeout(() => {
        repeatTimer = setInterval(action, 90);
      }, 420);
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
      element.addEventListener(type, stop)
    );
  };

  document.querySelectorAll(".dpad-key").forEach((key) => {
    const direction = key.dataset.move;
    key.addEventListener("click", () => moveCaret(direction));
    attachRepeat(key, () => moveCaret(direction));
  });

  // ---------- テンキー引き出し ----------

  const isOpen = () => numpad.classList.contains("is-open");

  const setNumpad = (open) => {
    if (!numpad) {
      return;
    }
    numpad.classList.toggle("is-open", open);
    if (root.dataset.kbMode === "mobile") {
      numpad.setAttribute("aria-hidden", open ? "false" : "true");
    } else {
      numpad.setAttribute("aria-hidden", "false");
    }
    if (numpadKey) {
      numpadKey.setAttribute("aria-expanded", String(open));
    }
  };

  // 上フリックで開く／下フリックで閉じる。動かさず離したときはタップ扱い。
  // ignore に該当する子要素から始まった操作は無視する。
  // ポインタキャプチャを取るとその後の click がキャプチャ先へ付け替えられ、
  // 子要素（閉じるボタン）自身の click ハンドラが呼ばれなくなるため。
  const attachFlick = (element, { onFlick, onTap, direction, ignore }) => {
    if (!element) {
      return;
    }
    let start = null;

    element.addEventListener("pointerdown", (event) => {
      if (ignore && event.target.closest && event.target.closest(ignore)) {
        start = null;
        return;
      }
      start = { x: event.clientX, y: event.clientY, fired: false };
      if (element.setPointerCapture) {
        try {
          element.setPointerCapture(event.pointerId);
        } catch (error) {
          // 取得できなくてもタップ操作は成立する
        }
      }
    });

    element.addEventListener("pointermove", (event) => {
      if (!start || start.fired) {
        return;
      }
      const dy = (event.clientY - start.y) * direction;
      const dx = Math.abs(event.clientX - start.x);
      if (dy > 18 && dy > dx) {
        start.fired = true;
        onFlick();
      }
    });

    const finish = (event) => {
      if (!start) {
        return;
      }
      const moved =
        Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y);
      if (!start.fired && moved < 12 && onTap) {
        onTap();
      }
      start = null;
    };

    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", () => {
      start = null;
    });
  };

  attachFlick(numpadKey, {
    direction: -1, // 上方向
    onFlick: () => setNumpad(true),
    onTap: () => setNumpad(!isOpen()),
  });

  attachFlick(numpadBar, {
    direction: 1, // 下方向
    onFlick: () => setNumpad(false),
    onTap: () => setNumpad(false), // つまみをタップしても閉じられるようにする
    ignore: ".numpad-close",
  });

  if (numpadClose) {
    numpadClose.addEventListener("click", (event) => {
      event.stopPropagation();
      setNumpad(false);
    });
  }

  // ---------- BackSpace 長押しリピート ----------

  attachRepeat(backspaceKey, () => {
    if (typeof backspace === "function") {
      backspace();
    }
  });

  // ---------- 入力後にキャレット位置を追う ----------

  if (keyboard && textarea) {
    keyboard.addEventListener("click", () => {
      if (root.dataset.kbMode !== "mobile") {
        return;
      }
      if (textarea.selectionStart >= textarea.value.length) {
        textarea.scrollTop = textarea.scrollHeight;
        textarea.scrollLeft = textarea.scrollWidth; // 縦書き時は横方向に伸びる
      }
    });
  }

  // ---------- 適用 ----------

  const applyMode = () => {
    const mode = resolveMode();
    root.dataset.kbMode = mode;
    root.dataset.kbInput = mode === "mobile" ? "custom" : "native";
    suppressNativeKeyboard(mode === "mobile");
    if (mode !== "mobile") {
      setNumpad(false);
    } else {
      setNumpad(isOpen());
    }
    updateToggleLabel();
    updateViewportUnit();
    requestAnimationFrame(fitKeys);
  };

  if (layoutToggle) {
    layoutToggle.addEventListener("click", () => {
      preference = MODES[(MODES.indexOf(preference) + 1) % MODES.length];
      writePreference(preference);
      applyMode();
    });
  }

  let pending = false;
  const scheduleApply = () => {
    if (pending) {
      return;
    }
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      applyMode();
    });
  };

  window.addEventListener("resize", scheduleApply);
  window.addEventListener("orientationchange", scheduleApply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleApply);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitKeys);
  }
  window.addEventListener("load", fitKeys);

  applyMode();
})();
