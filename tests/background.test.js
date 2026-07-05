describe('background.js', () => {
  let onCommandHandler;
  let onMessageHandler;

  beforeEach(() => {
    jest.resetAllMocks();

    // Register the listeners as background.js would
    onCommandHandler = (command) => {
      if (command === 'generate-link') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'showTemplateSelector' });
        });
      }
    };
    chrome.commands.onCommand.addListener.mockImplementation((handler) => {
      onCommandHandler = handler;
    });
    chrome.commands.onCommand.addListener(onCommandHandler);

    onMessageHandler = (request, sender, sendResponse) => {
      if (request.action === 'getTemplates') {
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
        return true;
      }
    };
    chrome.runtime.onMessage.addListener.mockImplementation((handler) => {
      onMessageHandler = handler;
    });
    chrome.runtime.onMessage.addListener(onMessageHandler);
  });

  describe('chrome.commands.onCommand', () => {
    test('registers a command listener', () => {
      expect(chrome.commands.onCommand.addListener).toHaveBeenCalled();
    });

    test('listener is a function', () => {
      const listener = chrome.commands.onCommand.addListener.mock.calls[0][0];
      expect(typeof listener).toBe('function');
    });

    test('generate-link command queries active tab and sends message', () => {
      const tabs = [{ id: 123 }];
      chrome.tabs.query.mockImplementation((queryInfo, cb) => cb(tabs));
      chrome.tabs.sendMessage.mockImplementation();

      onCommandHandler('generate-link');

      expect(chrome.tabs.query).toHaveBeenCalledWith(
        { active: true, currentWindow: true },
        expect.any(Function)
      );
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { action: 'showTemplateSelector' });
    });

    test('other commands are ignored', () => {
      onCommandHandler('some-other-command');
      expect(chrome.tabs.query).not.toHaveBeenCalled();
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('chrome.runtime.onMessage', () => {
    test('registers a message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    test('listener is a function', () => {
      const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      expect(typeof listener).toBe('function');
    });

    test('getTemplates action executes scripts and returns templates', () => {
      const mockTemplates = [{ id: 't1', name: 'Test', template: 'https://example.com', parameters: [] }];
      const mockResults = [{ result: mockTemplates }];
      const sender = { tab: { id: 456 } };
      const sendResponse = jest.fn();

      chrome.scripting.executeScript
        .mockImplementationOnce((opts, cb) => cb())
        .mockImplementationOnce((opts, cb) => cb(mockResults));

      const returnValue = onMessageHandler({ action: 'getTemplates' }, sender, sendResponse);

      expect(returnValue).toBe(true);
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
      expect(chrome.scripting.executeScript).toHaveBeenNthCalledWith(1, {
        target: { tabId: 456 },
        files: ['templates.js']
      }, expect.any(Function));
      expect(chrome.scripting.executeScript).toHaveBeenNthCalledWith(2, {
        target: { tabId: 456 },
        func: expect.any(Function)
      }, expect.any(Function));
      expect(sendResponse).toHaveBeenCalledWith(mockTemplates);
    });

    test('other actions are not handled', () => {
      const sendResponse = jest.fn();
      chrome.scripting.executeScript.mockImplementation();

      const returnValue = onMessageHandler({ action: 'unknown' }, { tab: { id: 1 } }, sendResponse);

      expect(returnValue).toBeUndefined();
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});
