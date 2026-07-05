const defaultTemplates = [];
const templateManager = {
  async getTemplates() {
    const result = await chrome.storage.local.get('templates');
    return result.templates || defaultTemplates;
  },

  async getTemplateById(id) {
    const templates = await this.getTemplates();
    return templates.find(t => t.id === id);
  },

  async addTemplate(template) {
    const templates = await this.getTemplates();
    if (!template.id) {
      template.id = 'template_' + Date.now();
    }
    templates.push(template);
    await chrome.storage.local.set({ templates });
    return template;
  },

  async updateTemplate(id, updatedTemplate) {
    const templates = await this.getTemplates();
    const index = templates.findIndex(t => t.id === id);
    if (index !== -1) {
      templates[index] = { ...templates[index], ...updatedTemplate };
      await chrome.storage.local.set({ templates });
      return templates[index];
    }
    throw new Error('Template not found');
  },

  async deleteTemplate(id) {
    const templates = await this.getTemplates();
    const filteredTemplates = templates.filter(t => t.id !== id);
    await chrome.storage.local.set({ templates: filteredTemplates });
  },

  generateLink(templateId, parameters) {
    return this.getTemplateById(templateId).then(template => {
      if (!template) {
        throw new Error('Template not found');
      }
      let url = template.template;
      for (const [key, value] of Object.entries(parameters)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
      }
      return url;
    });
  }
};

const mockTemplate = {
  id: 'template_1',
  name: 'Search',
  template: 'https://example.com/search?q={query}&lang={lang}',
  parameters: ['query', 'lang']
};

const mockTemplateNoId = {
  name: 'Search',
  template: 'https://example.com/search?q={query}',
  parameters: ['query']
};

describe('templateManager', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
  });

  describe('getTemplates', () => {
    test('returns defaultTemplates when no templates stored', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await templateManager.getTemplates();
      expect(result).toEqual([]);
    });

    test('returns stored templates when they exist', async () => {
      const stored = [mockTemplate];
      chrome.storage.local.get.mockResolvedValue({ templates: stored });
      const result = await templateManager.getTemplates();
      expect(result).toEqual(stored);
    });

    test('calls chrome.storage.local.get with "templates"', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      await templateManager.getTemplates();
      expect(chrome.storage.local.get).toHaveBeenCalledWith('templates');
    });
  });

  describe('getTemplateById', () => {
    test('returns template when id matches', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [mockTemplate] });
      const result = await templateManager.getTemplateById('template_1');
      expect(result).toEqual(mockTemplate);
    });

    test('returns undefined when id does not match', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [mockTemplate] });
      const result = await templateManager.getTemplateById('nonexistent');
      expect(result).toBeUndefined();
    });

    test('returns undefined when no templates exist', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await templateManager.getTemplateById('template_1');
      expect(result).toBeUndefined();
    });
  });

  describe('addTemplate', () => {
    test('adds template and stores it', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.local.set.mockResolvedValue();

      const result = await templateManager.addTemplate({ ...mockTemplate });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        templates: [mockTemplate]
      });
      expect(result).toEqual(mockTemplate);
    });

    test('auto-generates id when not provided', async () => {
      const now = 1234567890;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.local.set.mockResolvedValue();

      const result = await templateManager.addTemplate({ ...mockTemplateNoId });

      expect(result.id).toBe('template_' + now);
      Date.now.mockRestore();
    });

    test('appends to existing templates', async () => {
      const existing = [{ ...mockTemplate, id: 'template_1' }];
      const newTemplate = { ...mockTemplate, id: 'template_2', name: 'New' };
      chrome.storage.local.get.mockResolvedValue({ templates: existing });
      chrome.storage.local.set.mockResolvedValue();

      await templateManager.addTemplate(newTemplate);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        templates: [existing[0], newTemplate]
      });
    });
  });

  describe('updateTemplate', () => {
    test('updates existing template and returns merged result', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [mockTemplate] });
      chrome.storage.local.set.mockResolvedValue();

      const updates = { name: 'Updated Search' };
      const result = await templateManager.updateTemplate('template_1', updates);

      expect(result.name).toBe('Updated Search');
      expect(result.template).toBe(mockTemplate.template);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('throws error when template not found', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [mockTemplate] });

      await expect(
        templateManager.updateTemplate('nonexistent', { name: 'X' })
      ).rejects.toThrow('Template not found');
    });
  });

  describe('deleteTemplate', () => {
    test('removes template by id', async () => {
      const templates = [
        { ...mockTemplate, id: 'template_1' },
        { ...mockTemplate, id: 'template_2', name: 'Other' }
      ];
      chrome.storage.local.get.mockResolvedValue({ templates });
      chrome.storage.local.set.mockResolvedValue();

      await templateManager.deleteTemplate('template_1');

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        templates: [templates[1]]
      });
    });

    test('does nothing when id does not exist', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [mockTemplate] });
      chrome.storage.local.set.mockResolvedValue();

      await templateManager.deleteTemplate('nonexistent');

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        templates: [mockTemplate]
      });
    });

    test('handles empty stored templates list', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [] });
      chrome.storage.local.set.mockResolvedValue();

      await templateManager.deleteTemplate('nonexistent');

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        templates: []
      });
    });
  });

  describe('generateLink', () => {
    test('replaces parameters in template URL', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [mockTemplate] });

      const url = await templateManager.generateLink('template_1', {
        query: 'hello world',
        lang: 'en'
      });

      expect(url).toBe('https://example.com/search?q=hello%20world&lang=en');
    });

    test('encodes special characters in parameter values', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [mockTemplate] });

      const url = await templateManager.generateLink('template_1', {
        query: 'foo & bar?',
        lang: 'en'
      });

      expect(url).toBe('https://example.com/search?q=foo%20%26%20bar%3F&lang=en');
    });

    test('throws error when template not found', async () => {
      chrome.storage.local.get.mockResolvedValue({ templates: [] });

      await expect(
        templateManager.generateLink('nonexistent', { query: 'test' })
      ).rejects.toThrow('Template not found');
    });

    test('handles multiple replacements of same parameter via regex in template', async () => {
      // The current generateLink implementation uses String.replace with a string,
      // so it only replaces the first occurrence. This test documents that behavior.
      const tmpl = {
        id: 't1',
        name: 'Dual',
        template: 'https://example.com/{a}/view/{a}',
        parameters: ['a']
      };
      chrome.storage.local.get.mockResolvedValue({ templates: [tmpl] });

      const url = await templateManager.generateLink('t1', { a: 'xyz' });

      // String.replace with string value only replaces first occurrence
      expect(url).toBe('https://example.com/xyz/view/{a}');
    });

    test('leaves unreplaced placeholders intact', async () => {
      const tmpl = {
        id: 't1',
        name: 'Partial',
        template: 'https://example.com/{a}&b={b}',
        parameters: ['a']
      };
      chrome.storage.local.get.mockResolvedValue({ templates: [tmpl] });

      const url = await templateManager.generateLink('t1', { a: '123' });

      expect(url).toBe('https://example.com/123&b={b}');
    });
  });
});
