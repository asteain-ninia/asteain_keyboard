(() => {
  const storageKey = "asteain-theme";
  const root = document.documentElement;

  const isValidTheme = (value) => value === "classic" || value === "rich";
  const normalizeTheme = (value) => {
    if (isValidTheme(value)) {
      return value;
    }
    return "classic";
  };

  const readStoredTheme = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  };

  const applyTheme = (value) => {
    root.dataset.theme = normalizeTheme(value);
  };

  applyTheme(readStoredTheme());

  let isEmbedded = false;
  try {
    isEmbedded = window.self !== window.top;
  } catch (error) {
    isEmbedded = true;
  }

  let button = null;
  const updateLabel = () => {
    if (!button) {
      return;
    }
    const isRich = root.dataset.theme === "rich";
    button.setAttribute("aria-pressed", String(isRich));
    if (isRich) {
      button.textContent = "標準表示に切替";
    } else {
      button.textContent = "リッチ表示に切替";
    }
  };

  const persistTheme = (value) => {
    try {
      localStorage.setItem(storageKey, value);
    } catch (error) {
      // Ignore storage errors and keep the in-memory setting.
    }
  };

  const setTheme = (value, shouldPersist) => {
    applyTheme(value);
    if (shouldPersist) {
      persistTheme(root.dataset.theme);
    }
    updateLabel();
  };

  window.addEventListener("storage", (event) => {
    if (!event || event.key !== storageKey) {
      return;
    }
    applyTheme(event.newValue);
    updateLabel();
  });

  window.addEventListener("message", (event) => {
    if (!event || !event.data || event.data.type !== "asteain-theme") {
      return;
    }
    applyTheme(event.data.value);
    updateLabel();
  });

  if (isEmbedded) {
    return;
  }

  const broadcastTheme = (value) => {
    const payload = { type: "asteain-theme", value };
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        frame.contentWindow?.postMessage(payload, "*");
      } catch (error) {
        // Ignore cross-window messaging errors.
      }
    });
  };

  button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";
  button.setAttribute("aria-live", "polite");

  button.addEventListener("click", () => {
    let nextTheme = "rich";
    if (root.dataset.theme === "rich") {
      nextTheme = "classic";
    }
    setTheme(nextTheme, true);
    broadcastTheme(nextTheme);
  });

  updateLabel();

  const attachButton = () => {
    if (!document.body || document.body.contains(button)) {
      return;
    }
    document.body.appendChild(button);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachButton);
  } else {
    attachButton();
  }

  window.addEventListener("load", () => {
    broadcastTheme(root.dataset.theme);
  });
})();
