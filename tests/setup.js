// Polyfill CSS.escape for jsdom
if (typeof CSS === 'undefined') {
  global.CSS = {};
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/[\x00-\x1f\x7f-\x9f!"#$%&'()*+,.\/:;<=>?@[\]^`{|}~\\]/g, (c) => {
      if (c === '\x00') return '\uFFFD';
      return '\\' + c.charCodeAt(0).toString(16).padStart(2, '0') + ' ';
    });
  };
}

// Mock the chrome API
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  },
  commands: {
    onCommand: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  },
  scripting: {
    executeScript: jest.fn()
  }
};

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// jsdom does not provide requestAnimationFrame
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
