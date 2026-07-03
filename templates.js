// Default template
const defaultTemplates = [];

// Template management functions
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
    // Generate a unique ID if not provided
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
