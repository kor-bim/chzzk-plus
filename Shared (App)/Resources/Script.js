function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('platform-mac state-off')[0].innerText = "확장 프로그램이 꺼져 있습니다. Safari 설정에서 활성화해 주세요.";
        document.getElementsByClassName('platform-mac state-unknown')[0].innerText = "Safari 설정의 확장 프로그램에서 CHZZK Plus를 켜주세요.";
        document.getElementsByClassName('platform-mac open-preferences')[0].innerText = "Safari 확장 프로그램 설정 열기";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
