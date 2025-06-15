// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'generate-link') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showTemplateSelector' });
    });
  }
});

// Handle template requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTemplates') {
    // In a real implementation, this would come from storage or an API
    // For now, we'll use the templates defined in templates.js
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['templates.js']
    }, () => {
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        func: () => templateManager.getTemplates()
      }, (results) => {
        sendResponse(results[0].result);
      });
    });
    return true; // Required for async sendResponse
  }
}); 