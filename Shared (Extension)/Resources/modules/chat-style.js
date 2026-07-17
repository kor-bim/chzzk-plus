(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;

  CP.modules.ChatStyle = class ChatStyle {
    update() {
      document.documentElement.classList.toggle(
        "chzzk-plus-hide-ranking",
        Boolean(CP.settings.enabled && CP.settings.rankingHideEnabled)
      );
    }
  };
})();
