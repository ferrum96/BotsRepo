import { init, openInvoice as sdkOpenInvoice, openTelegramLink, retrieveRawInitData } from "@telegram-apps/sdk";

export function readInitData() {
  try {
    init();
    return retrieveRawInitData() || window.Telegram?.WebApp?.initData || "";
  } catch {
    return window.Telegram?.WebApp?.initData || "";
  }
}

export function openInvoice(url) {
  try {
    sdkOpenInvoice(url);
    return;
  } catch {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.openInvoice) {
      webApp.openInvoice(url);
      return;
    }
    window.open(url, "_blank", "noopener");
  }
}

export function shareLink(url) {
  try {
    openTelegramLink(url);
  } catch {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(url);
      return;
    }
    window.open(url, "_blank", "noopener");
  }
}
