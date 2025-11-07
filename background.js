chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.url.includes("/pages/") && details.url.endsWith(".xml")) {
      console.log("Đã tìm thấy URL bài tập:", details.url);

      chrome.storage.local.set({ lastExerciseUrl: details.url });
    }
  },
  {
    urls: ["*://*.pearson.com/*/*.xml*"],
    types: ["xmlhttprequest", "other"],
  }
);
