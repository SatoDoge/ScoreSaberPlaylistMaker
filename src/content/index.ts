import { isPingMessage, type PongMessage } from "../shared/messages";

document.documentElement.dataset.sspm = "ready";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPingMessage(message)) {
    return;
  }

  const response: PongMessage = {
    type: "pong",
    href: location.href,
  };
  sendResponse(response);
});
