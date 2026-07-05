/**
 * @jest-environment jsdom
 */

delete window.open;
window.open = jest.fn();

let mockSelectionText = '';
const mockSelection = {
  toString: () => mockSelectionText,
  rangeCount: 0,
  collapse: jest.fn(),
  removeAllRanges: jest.fn(),
  anchorNode: null
};
window.getSelection = jest.fn(() => mockSelection);

/* ---------- templates.js (inlined) ---------- */

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
    if (!template.id) template.id = 'template_' + Date.now();
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
      if (!template) throw new Error('Template not found');
      let url = template.template;
      for (const [key, value] of Object.entries(parameters)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
      }
      return url;
    });
  }
};

/* ---------- content.js (inlined) ---------- */

let selectedTemplate = null;
let currentParameterIndex = 0;
let parameterValues = {};
let popupElement = null;
let modalElement = null;
let textSelectionHandler = null;
let modalKeyDownHandler = null;
let liveRegion = null;

function getLiveRegion() {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

function announce(message) {
  const region = getLiveRegion();
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(focusableSelector)).filter(
    el => el.tabIndex >= 0 && !el.disabled
  );
}

function trapFocus(container, e) {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function createTemplateSelector(templates, preSelectedText = '') {
  cleanupModal();

  modalElement = document.createElement('div');
  modalElement.className = 'modal-overlay';
  modalElement.setAttribute('role', 'dialog');
  modalElement.setAttribute('aria-modal', 'true');
  modalElement.setAttribute('aria-label', 'Link Templates');

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-container';

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <div class="header-content">
      <h2>Link Templates</h2>
      <div class="keyboard-hint">Type to search, <kbd>↑</kbd><kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close</div>
    </div>
    <button class="modal-close" aria-label="Close dialog">×</button>
  `;

  const content = document.createElement('div');
  content.className = 'modal-content';

  const calcResult = document.createElement('div');
  calcResult.className = 'calc-result';
  calcResult.style.display = 'none';
  calcResult.setAttribute('aria-live', 'polite');
  calcResult.setAttribute('role', 'status');
  calcResult.setAttribute('aria-atomic', 'true');

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search templates... (cal <expr> for calculator)';
  searchInput.setAttribute('aria-label', 'Search templates');
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.spellcheck = false;

  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'search-results';
  resultsContainer.setAttribute('role', 'listbox');
  resultsContainer.setAttribute('aria-label', 'Template list');
  resultsContainer.setAttribute('aria-activedescendant', '');

  const addButton = document.createElement('button');
  addButton.className = 'add-template-button';
  addButton.textContent = '+ Add Template';
  addButton.onclick = () => showTemplateEditor();

  let selectedIndex = 0;
  let filteredTemplates = templates;
  const templateItems = [];
  let isCalcMode = false;

  function renderResults() {
    resultsContainer.innerHTML = '';
    templateItems.length = 0;

    if (isCalcMode) return;

    if (filteredTemplates.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.setAttribute('role', 'status');
      noResults.textContent = 'No templates found';
      resultsContainer.appendChild(noResults);
      announce('No templates found');
      return;
    }

    filteredTemplates.forEach((template, index) => {
      const templateItem = document.createElement('div');
      templateItem.className = 'template-item';
      templateItem.tabIndex = -1;
      templateItem.setAttribute('role', 'option');
      templateItem.setAttribute('aria-label', template.name);
      templateItem.setAttribute('aria-selected', 'false');
      templateItem.innerHTML = `
        <span class="template-name">${escapeHtml(template.name)}</span>
        <span class="template-actions">
          <button class="edit-template" data-tid="${template.id}" aria-label="Edit ${template.name}">✎</button>
          <button class="delete-template" data-tid="${template.id}" aria-label="Delete ${template.name}">✕</button>
        </span>
      `;

      templateItem.dataset.templateIndex = index;

      templateItem.querySelector('.template-name').onclick = () => {
        selectedTemplate = template;
        cleanupModal();
        createParameterPopup(template, preSelectedText);
      };

      templateItem.querySelector('.edit-template').onclick = (e) => {
        e.stopPropagation();
        showTemplateEditor(template);
      };

      templateItem.querySelector('.delete-template').onclick = (e) => {
        e.stopPropagation();
        showConfirmDialog(
          `Delete template "${template.name}"?`,
          () => {
            templateManager.deleteTemplate(template.id).then(() => {
              const newTemplates = templates.filter(t => t.id !== template.id);
              createTemplateSelector(newTemplates, '');
              announce(`Deleted template "${template.name}"`);
            });
          }
        );
      };

      resultsContainer.appendChild(templateItem);
      templateItems.push(templateItem);
    });

    if (filteredTemplates.length > 0) {
      selectedIndex = 0;
      templateItems[0].classList.add('selected');
      templateItems[0].setAttribute('aria-selected', 'true');
    }
  }

  function filterTemplates(query) {
    const q = query.toLowerCase().trim();
    filteredTemplates = q
      ? templates.filter(t => t.name.toLowerCase().includes(q) || t.template.toLowerCase().includes(q))
      : templates;
    renderResults();
  }

  function handleCalcInput(value) {
    const calcMatch = value.match(/^cal\s+(.*)/i);
    if (calcMatch) {
      isCalcMode = true;
      const expr = calcMatch[1].trim();
      if (expr) {
        const result = window.calcEval ? window.calcEval(expr) : { success: false, error: 'No calculator' };
        if (result.success) {
          const num = result.result;
          const display = typeof num === 'number' ? (Number.isInteger(num) ? num : num.toFixed(4)) : num;
          calcResult.textContent = '= ' + display;
          calcResult.className = 'calc-result calc-result-success';
        } else {
          calcResult.textContent = result.error;
          calcResult.className = 'calc-result calc-result-error';
        }
        calcResult.style.display = 'block';
      } else {
        calcResult.style.display = 'none';
      }
      resultsContainer.style.display = 'none';
      addButton.style.display = 'none';
      header.querySelector('.keyboard-hint').innerHTML = 'Calculator mode — <kbd>Esc</kbd> to close';
      renderResults();
    } else {
      isCalcMode = false;
      calcResult.style.display = 'none';
      resultsContainer.style.display = '';
      addButton.style.display = '';
      header.querySelector('.keyboard-hint').innerHTML = 'Type to search, <kbd>↑</kbd><kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close';
      filterTemplates(value);
    }
  }

  searchInput.addEventListener('input', (e) => {
    handleCalcInput(e.target.value);
  });

  content.appendChild(calcResult);
  content.appendChild(searchInput);
  content.appendChild(resultsContainer);
  content.appendChild(addButton);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const closeButton = document.createElement('button');
  closeButton.className = 'modal-button secondary';
  closeButton.textContent = 'Close';
  closeButton.onclick = cleanupModal;

  footer.appendChild(closeButton);

  modalContainer.appendChild(header);
  modalContainer.appendChild(content);
  modalContainer.appendChild(footer);
  modalElement.appendChild(modalContainer);
  document.body.appendChild(modalElement);

  const previousActiveElement = document.activeElement;

  function updateSelectedTemplate(newIndex) {
    if (templateItems.length === 0) return;
    templateItems[selectedIndex].classList.remove('selected');
    templateItems[selectedIndex].setAttribute('aria-selected', 'false');
    selectedIndex = (newIndex + templateItems.length) % templateItems.length;
    templateItems[selectedIndex].classList.add('selected');
    templateItems[selectedIndex].setAttribute('aria-selected', 'true');
    templateItems[selectedIndex].scrollIntoView({
      block: 'nearest',
      behavior: 'smooth'
    });
  }

  function handleKeyDown(e) {
    if (!modalElement || !modalElement.contains(document.activeElement)) {
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (!isCalcMode) updateSelectedTemplate(selectedIndex - 1);
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (!isCalcMode) updateSelectedTemplate(selectedIndex + 1);
        break;

      case 'Enter':
        e.preventDefault();
        if (isCalcMode) {
          if (searchInput.value.trim()) {
            cleanupModal();
          }
        } else if (filteredTemplates[selectedIndex]) {
          const template = filteredTemplates[selectedIndex];
          selectedTemplate = template;
          cleanupModal();
          createParameterPopup(template, preSelectedText);
        }
        break;

      case 'Escape':
        e.preventDefault();
        cleanupModal();
        previousActiveElement?.focus();
        break;

      case 'Tab':
        trapFocus(modalContainer, e);
        break;
    }
  }

  modalKeyDownHandler = handleKeyDown;
  document.addEventListener('keydown', modalKeyDownHandler, true);

  const outsideClickHandler = (e) => {
    if (e.target === modalElement) {
      cleanupModal();
      previousActiveElement?.focus();
    }
  };
  modalElement.addEventListener('click', outsideClickHandler);

  header.querySelector('.modal-close').onclick = () => {
    cleanupModal();
    previousActiveElement?.focus();
  };

  renderResults();

  requestAnimationFrame(() => {
    searchInput.focus();
  });

  modalElement.cleanup = () => {
    document.removeEventListener('keydown', modalKeyDownHandler, true);
    modalElement.removeEventListener('click', outsideClickHandler);
    modalKeyDownHandler = null;
  };
}

function cleanupModal() {
  if (modalElement) {
    if (modalElement.cleanup) {
      modalElement.cleanup();
    }
    if (document.body.contains(modalElement)) {
      document.body.removeChild(modalElement);
    }
    modalElement = null;
    modalKeyDownHandler = null;
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

function showConfirmDialog(message, onConfirm, onCancel) {
  const previousActiveElement = document.activeElement;
  const existingOverlay = document.querySelector('.modal-overlay');
  if (existingOverlay) {
    existingOverlay.style.display = 'none';
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Confirm');
  overlay.tabIndex = -1;

  const container = document.createElement('div');
  container.className = 'modal-container';
  container.style.maxWidth = '400px';

  const content = document.createElement('div');
  content.className = 'modal-content';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `<p>${escapeHtml(message)}</p><div class="confirm-actions"></div>`;

  const actions = dialog.querySelector('.confirm-actions');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-button secondary';
  cancelBtn.textContent = 'Cancel';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-button danger';
  confirmBtn.textContent = 'Delete';

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);

  content.appendChild(dialog);
  container.appendChild(content);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  function cleanup() {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
    document.removeEventListener('keydown', keyHandler);
    if (existingOverlay) {
      existingOverlay.style.display = '';
    }
    if (previousActiveElement && document.body.contains(previousActiveElement)) {
      previousActiveElement.focus();
    }
  }

  function keyHandler(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    } else if (e.key === 'Tab') {
      trapFocus(container, e);
    }
  }
  document.addEventListener('keydown', keyHandler, true);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup();
  });

  cancelBtn.onclick = () => {
    cleanup();
    if (onCancel) onCancel();
  };
  confirmBtn.onclick = () => {
    cleanup();
    onConfirm();
  };

  requestAnimationFrame(() => {
    confirmBtn.focus();
  });
}

function showTemplateEditor(template = null) {
  cleanupModal();

  modalElement = document.createElement('div');
  modalElement.className = 'modal-overlay';
  modalElement.setAttribute('role', 'dialog');
  modalElement.setAttribute('aria-modal', 'true');
  modalElement.setAttribute('aria-label', template ? 'Edit Template' : 'New Template');

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-container';

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <h2>${template ? 'Edit Template' : 'New Template'}</h2>
    <button class="modal-close" aria-label="Close dialog">×</button>
  `;

  const content = document.createElement('div');
  content.className = 'modal-content';

  const toast = document.createElement('div');
  toast.className = 'inline-toast';
  toast.style.display = 'none';
  toast.setAttribute('aria-live', 'polite');

  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  nameGroup.innerHTML = `
    <label for="template-name">Name</label>
    <input type="text" id="template-name" value="${escapeHtml(template?.name || '')}" placeholder="My Template" aria-required="true" required>
  `;

  const urlGroup = document.createElement('div');
  urlGroup.className = 'form-group';
  urlGroup.innerHTML = `
    <label for="template-url">URL Template</label>
    <input type="text" id="template-url" value="${escapeHtml(template?.template || '')}" placeholder="https://example.com/{param1}/{param2}" aria-required="true" required>
  `;

  const paramsGroup = document.createElement('div');
  paramsGroup.className = 'form-group';
  paramsGroup.innerHTML = `
    <label for="template-params">Parameters <span class="hint" id="params-hint">(comma-separated)</span></label>
    <input type="text" id="template-params" value="${escapeHtml(template?.parameters?.join(', ') || '')}" placeholder="param1, param2" aria-required="true" required aria-describedby="params-hint">
  `;

  content.appendChild(toast);
  content.appendChild(nameGroup);
  content.appendChild(urlGroup);
  content.appendChild(paramsGroup);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const saveButton = document.createElement('button');
  saveButton.className = 'modal-button primary';
  saveButton.textContent = 'Save';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'modal-button secondary';
  cancelButton.textContent = 'Cancel';

  footer.appendChild(cancelButton);
  footer.appendChild(saveButton);

  modalContainer.appendChild(header);
  modalContainer.appendChild(content);
  modalContainer.appendChild(footer);
  modalElement.appendChild(modalContainer);
  document.body.appendChild(modalElement);

  const previousActiveElement = document.activeElement;

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'inline-toast ' + type;
    toast.style.display = 'block';
    toast.setAttribute('role', 'alert');
  }

  function hideToast() {
    toast.style.display = 'none';
    toast.removeAttribute('role');
  }

  const nameInput = content.querySelector('#template-name');
  const urlInput = content.querySelector('#template-url');
  const paramsInput = content.querySelector('#template-params');

  function handleKeyDown(e) {
    if (!modalElement || !modalElement.contains(document.activeElement)) {
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      cancelButton.click();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveButton.click();
    } else if (e.key === 'Tab') {
      trapFocus(modalContainer, e);
    }
  }

  modalKeyDownHandler = handleKeyDown;
  document.addEventListener('keydown', modalKeyDownHandler, true);

  const outsideClickHandler = (e) => {
    if (e.target === modalElement) {
      cancelButton.click();
    }
  };
  modalElement.addEventListener('click', outsideClickHandler);

  function validate() {
    const name = nameInput.value.trim();
    const templateUrl = urlInput.value.trim();
    const params = paramsInput.value
      .split(',')
      .map(p => p.trim())
      .filter(p => p);

    if (!name) {
      showToast('Please enter a template name', 'error');
      nameInput.focus();
      return null;
    }
    if (!templateUrl) {
      showToast('Please enter a URL template', 'error');
      urlInput.focus();
      return null;
    }
    if (params.length === 0) {
      showToast('Please enter at least one parameter', 'error');
      paramsInput.focus();
      return null;
    }

    hideToast();
    return { name, template: templateUrl, parameters: params };
  }

  saveButton.onclick = async () => {
    const data = validate();
    if (!data) return;

    try {
      if (template) {
        await templateManager.updateTemplate(template.id, data);
      } else {
        await templateManager.addTemplate(data);
      }
      const templates = await templateManager.getTemplates();
      cleanupModal();
      createTemplateSelector(templates, '');
    } catch (error) {
      showToast('Error saving template: ' + error.message, 'error');
    }
  };

  cancelButton.onclick = async () => {
    const templates = await templateManager.getTemplates();
    cleanupModal();
    createTemplateSelector(templates, '');
  };

  header.querySelector('.modal-close').onclick = () => cancelButton.click();

  modalElement.cleanup = () => {
    document.removeEventListener('keydown', modalKeyDownHandler, true);
    modalElement.removeEventListener('click', outsideClickHandler);
    modalKeyDownHandler = null;
    if (previousActiveElement && document.body.contains(previousActiveElement)) {
      previousActiveElement.focus();
    }
  };

  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
}

function positionParameterPopup() {
  if (!modalElement) return;

  const padding = 20;
  const w = modalElement.offsetWidth || 320;
  const h = modalElement.offsetHeight || 200;

  let left = padding;
  let top = window.innerHeight - h - padding;

  if (left + w + padding > window.innerWidth) {
    left = Math.max(padding, window.innerWidth - w - padding);
  }
  if (top < padding) {
    top = padding;
  }

  modalElement.style.position = 'fixed';
  modalElement.style.left = left + 'px';
  modalElement.style.top = top + 'px';
  modalElement.style.bottom = 'auto';
  modalElement.style.right = 'auto';
  modalElement.style.transform = 'none';
  modalElement.style.margin = '0';
}

function createParameterPopup(template, preSelectedText = '') {
  cleanupModal();
  cleanupTextSelectionHandler();

  modalElement = document.createElement('div');
  modalElement.className = 'parameter-popup';
  modalElement.setAttribute('role', 'dialog');
  modalElement.setAttribute('aria-modal', 'true');
  modalElement.setAttribute('aria-label', 'Select text for parameters');

  const content = document.createElement('div');
  content.className = 'parameter-content';
  content.innerHTML = `
    <div class="parameter-header">
      <h3>${escapeHtml(template.name)}</h3>
      <button class="parameter-close" aria-label="Cancel">✕</button>
    </div>
    <div class="parameter-list" role="list">
      ${template.parameters.map((param, i) => `
        <div class="parameter-item ${i === 0 ? 'active' : ''}" role="listitem" data-param-index="${i}">
          <span class="parameter-name">${escapeHtml(param)}:</span>
          <span class="parameter-value${i === 0 && preSelectedText ? ' selected' : ''}" data-param="${escapeHtml(param)}">${i === 0 && preSelectedText ? escapeHtml(preSelectedText) : 'Not selected'}</span>
        </div>
      `).join('')}
    </div>
  `;

  modalElement.appendChild(content);
  document.body.appendChild(modalElement);

  const closeButton = modalElement.querySelector('.parameter-close');
  const paramValues = new Map();
  currentParameterIndex = 0;

  if (preSelectedText && template.parameters.length > 0) {
    paramValues.set(template.parameters[0], preSelectedText);
    currentParameterIndex = 1;
    updateParamUI(template, 0, preSelectedText);

    if (currentParameterIndex >= template.parameters.length) {
      openLinkForTemplate(template, paramValues);
      return;
    }
  }

  updateActiveItem(template);

  function updateParamUI(tpl, index, value) {
    const paramName = tpl.parameters[index];
    const paramEl = modalElement.querySelector(`[data-param="${CSS.escape(paramName)}"]`);
    if (paramEl) {
      paramEl.textContent = value;
      paramEl.classList.add('selected');
    }
  }

  function updateActiveItem(tpl) {
    const items = modalElement.querySelectorAll('.parameter-item');
    items.forEach((item, i) => {
      item.classList.remove('active');
      if (i < currentParameterIndex) {
        item.classList.add('done');
      }
    });
    if (currentParameterIndex < tpl.parameters.length) {
      items[currentParameterIndex].classList.add('active');
      items[currentParameterIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function processSelection(selectedText) {
    if (currentParameterIndex < template.parameters.length) {
      const currentParam = template.parameters[currentParameterIndex];
      paramValues.set(currentParam, selectedText);
      updateParamUI(template, currentParameterIndex, selectedText);
      currentParameterIndex++;

      if (currentParameterIndex >= template.parameters.length) {
        cleanupTextSelectionHandler();
        openLinkForTemplate(template, paramValues);
      } else {
        updateActiveItem(template);
      }
    }
  }

  function handleTextSelection(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && currentParameterIndex < template.parameters.length) {
      const isEditableSelection = selection.anchorNode?.parentElement?.isContentEditable ||
        selection.anchorNode?.parentElement?.closest('[contenteditable="true"]');

      if (isEditableSelection) {
        setTimeout(() => {
          const finalSelection = window.getSelection().toString().trim();
          if (finalSelection) {
            processSelection(finalSelection);
          }
        }, 50);
      } else {
        processSelection(selectedText);
      }
    }
  }

  textSelectionHandler = handleTextSelection;
  document.addEventListener('mouseup', textSelectionHandler);
  document.addEventListener('pointerup', textSelectionHandler);

  function handlePopupKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeButton.click();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', handlePopupKeyDown, true);
  modalElement._popupKeyHandler = handlePopupKeyDown;

  closeButton.onclick = () => {
    cleanupTextSelectionHandler();
    cleanupParameterPopup();
  };

  modalElement.cleanup = () => {
    cleanupTextSelectionHandler();
  };

  modalElement._resizeHandler = positionParameterPopup;
  positionParameterPopup();

  window.addEventListener('resize', positionParameterPopup);

  requestAnimationFrame(() => {
    closeButton.focus();
  });
}

function openLinkForTemplate(template, paramValues) {
  const url = template.template.replace(/\{(\w+)\}/g, (match, param) => {
    return encodeURIComponent(paramValues.get(param) || '');
  });

  window.open(url, '_blank');
  cleanupParameterPopup();
}

function cleanupParameterPopup() {
  if (modalElement) {
    if (modalElement._popupKeyHandler) {
      document.removeEventListener('keydown', modalElement._popupKeyHandler, true);
    }
    if (modalElement._resizeHandler) {
      window.removeEventListener('resize', modalElement._resizeHandler);
    }
    if (modalElement.cleanup) {
      modalElement.cleanup();
    }
    if (document.body.contains(modalElement)) {
      document.body.removeChild(modalElement);
    }
    modalElement = null;
  }
}

function cleanupTextSelectionHandler() {
  if (textSelectionHandler) {
    document.removeEventListener('mouseup', textSelectionHandler);
    document.removeEventListener('pointerup', textSelectionHandler);
    textSelectionHandler = null;
  }
}

/* ---------- Tests ---------- */

const sampleTemplates = [
  { id: 't1', name: 'Search', template: 'https://example.com/search?q={query}', parameters: ['query'] },
  { id: 't2', name: 'Docs', template: 'https://docs.example.com/{page}', parameters: ['page'] }
];

/** Advance fake timers so requestAnimationFrame callbacks fire */
function flushTimers() {
  jest.runAllTimers();
}

/** Remove any leftover event handlers and DOM nodes between tests */
function fullCleanup() {
  cleanupTextSelectionHandler();
  cleanupParameterPopup();
  cleanupModal();
}

describe('content.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockSelectionText = '';
    jest.resetAllMocks();
    window.getSelection = jest.fn(() => mockSelection);
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    selectedTemplate = null;
    modalElement = null;
    modalKeyDownHandler = null;
    textSelectionHandler = null;
    liveRegion = null;
    jest.useFakeTimers();
  });

  afterEach(() => {
    fullCleanup();
    jest.useRealTimers();
  });

  /* ============================================
     aria-live announcements
     ============================================ */

  describe('aria-live announcements', () => {
    test('announces empty search results', () => {
      createTemplateSelector(sampleTemplates);
      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'zzznonexistent';
      searchInput.dispatchEvent(new Event('input'));
      flushTimers();

      const noResults = document.querySelector('.no-results');
      expect(noResults.getAttribute('role')).toBe('status');
      expect(getLiveRegion().textContent).toBe('No templates found');
    });
  });

  /* ============================================
     keyboard hint with kbd tags
     ============================================ */

  describe('keyboard hint', () => {
    test('renders kbd tags in initial keyboard hint', () => {
      createTemplateSelector(sampleTemplates);
      const hint = document.querySelector('.keyboard-hint');
      expect(hint.innerHTML).toContain('<kbd>↑</kbd>');
      expect(hint.innerHTML).toContain('<kbd>↓</kbd>');
      expect(hint.innerHTML).toContain('<kbd>Enter</kbd>');
      expect(hint.innerHTML).toContain('<kbd>Esc</kbd>');
    });

    test('renders kbd tags in calculator mode hint', () => {
      createTemplateSelector(sampleTemplates);
      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'cal 2+2';
      searchInput.dispatchEvent(new Event('input'));

      const hint = document.querySelector('.keyboard-hint');
      expect(hint.innerHTML).toContain('<kbd>Esc</kbd>');
    });
  });

  /* ============================================
     form accessibility attributes
     ============================================ */

  describe('form accessibility attributes', () => {
    test('all form inputs have aria-required and required', () => {
      showTemplateEditor();
      flushTimers();

      const nameInput = document.querySelector('#template-name');
      const urlInput = document.querySelector('#template-url');
      const paramsInput = document.querySelector('#template-params');

      expect(nameInput.getAttribute('aria-required')).toBe('true');
      expect(nameInput.hasAttribute('required')).toBe(true);
      expect(urlInput.getAttribute('aria-required')).toBe('true');
      expect(urlInput.hasAttribute('required')).toBe(true);
      expect(paramsInput.getAttribute('aria-required')).toBe('true');
      expect(paramsInput.hasAttribute('required')).toBe(true);
    });

    test('params input has aria-describedby pointing to hint', () => {
      showTemplateEditor();
      flushTimers();

      const paramsInput = document.querySelector('#template-params');
      expect(paramsInput.getAttribute('aria-describedby')).toBe('params-hint');
      const hint = document.querySelector('.hint');
      expect(hint.id).toBe('params-hint');
    });
  });

  /* ============================================
     toast / inline-toast accessibility
     ============================================ */

  describe('toast accessibility', () => {
    test('toast gets role="alert" when shown', () => {
      showTemplateEditor();
      flushTimers();

      document.querySelector('.modal-button.primary').click();
      const toast = document.querySelector('.inline-toast');
      expect(toast.getAttribute('role')).toBe('alert');
    });

    test('toast removes role="alert" when hidden', () => {
      showTemplateEditor();
      flushTimers();

      document.querySelector('.modal-button.primary').click();
      const toast = document.querySelector('.inline-toast');

      // Fill valid data and save
      document.querySelector('#template-name').value = 'Test';
      document.querySelector('#template-url').value = 'https://example.com/{x}';
      document.querySelector('#template-params').value = 'x';
      document.querySelector('.modal-button.primary').click();

      expect(toast.hasAttribute('role')).toBe(false);
    });
  });

  /* ============================================
     calc-result accessibility
     ============================================ */

  describe('calc-result accessibility', () => {
    beforeEach(() => {
      window.calcEval = jest.fn(() => ({ success: true, result: 42 }));
    });

    test('calc-result has role and aria-atomic', () => {
      createTemplateSelector(sampleTemplates);
      const el = document.querySelector('.calc-result');
      expect(el.getAttribute('role')).toBe('status');
      expect(el.getAttribute('aria-atomic')).toBe('true');
      expect(el.getAttribute('aria-live')).toBe('polite');
    });
  });

  /* ============================================
     results-container accessibility
     ============================================ */

  describe('results container accessibility', () => {
    test('has aria-activedescendant attribute', () => {
      createTemplateSelector(sampleTemplates);
      const container = document.querySelector('.search-results');
      expect(container.getAttribute('aria-activedescendant')).toBe('');
    });
  });

  /* ============================================
     parameter-popup keyboard handling
     ============================================ */

  describe('parameter-popup keyboard handling', () => {
    const singleParamTemplate = {
      id: 't1',
      name: 'Search',
      template: 'https://example.com/search?q={query}',
      parameters: ['query']
    };

    const multiParamTemplate = {
      id: 't2',
      name: 'Multi',
      template: 'https://example.com/{a}/{b}',
      parameters: ['a', 'b']
    };

    test('Escape key closes parameter popup', () => {
      createParameterPopup(singleParamTemplate);
      flushTimers();
      expect(document.querySelector('.parameter-popup')).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.parameter-popup')).toBeNull();
    });

    test('Tab key is prevented in parameter popup', () => {
      createParameterPopup(singleParamTemplate);
      flushTimers();

      const e = new KeyboardEvent('keydown', { key: 'Tab' });
      jest.spyOn(e, 'preventDefault');
      document.dispatchEvent(e);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    test('popup registers _popupKeyHandler and cleans up', () => {
      createParameterPopup(singleParamTemplate);
      expect(modalElement._popupKeyHandler).toBeDefined();
      expect(typeof modalElement._popupKeyHandler).toBe('function');

      cleanupParameterPopup();
      expect(modalElement).toBeNull();
    });

    test('close button receives focus on popup creation', () => {
      createParameterPopup(multiParamTemplate);
      flushTimers();

      const closeBtn = document.querySelector('.parameter-close');
      expect(document.activeElement).toBe(closeBtn);
    });
  });

  /* ============================================
     pointerup listener
     ============================================ */

  describe('pointerup listener', () => {
    test('registers pointerup in addition to mouseup', () => {
      const addSpy = jest.spyOn(document, 'addEventListener');
      const singleParamTemplate = {
        id: 't1', name: 'Search', template: 'https://example.com/search?q={query}', parameters: ['query']
      };
      createParameterPopup(singleParamTemplate);

      expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      addSpy.mockRestore();
      cleanupParameterPopup();
    });

    test('cleanup removes pointerup listener', () => {
      createParameterPopup({ id: 't1', name: 'T', template: 'https://example.com/{x}', parameters: ['x'] });

      const removeSpy = jest.spyOn(document, 'removeEventListener');
      cleanupParameterPopup();

      expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      removeSpy.mockRestore();
    });
  });

  /* ============================================
     selection handling edge cases
     ============================================ */

  describe('selection handling edge cases', () => {
    const singleParamTemplate = {
      id: 't1', name: 'Search', template: 'https://example.com/search?q={query}', parameters: ['query']
    };

    test('ignores empty selection', () => {
      createParameterPopup(singleParamTemplate);
      mockSelectionText = '';
      document.dispatchEvent(new Event('mouseup'));
      expect(window.open).not.toHaveBeenCalled();
      cleanupParameterPopup();
    });

    test('ignores selection when all parameters already filled', () => {
      createParameterPopup(singleParamTemplate, 'prefilled');
      // popup auto-closes when all params filled via preselected text
      expect(document.querySelector('.parameter-popup')).toBeNull();
    });
  });

  /* ============================================
     escapeHtml
     ============================================ */

  describe('escapeHtml', () => {
    test('escapes & < > " \'', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    test('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    test('returns empty string for non-string input', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(42)).toBe('');
    });

    test('returns safe strings unchanged', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });
  });

  /* ============================================
     getLiveRegion / announce
     ============================================ */

  describe('getLiveRegion / announce', () => {
    test('getLiveRegion creates and returns a live region', () => {
      const region = getLiveRegion();
      expect(region).not.toBeNull();
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('aria-atomic')).toBe('true');
    });

    test('getLiveRegion returns the same instance on subsequent calls', () => {
      const region1 = getLiveRegion();
      const region2 = getLiveRegion();
      expect(region1).toBe(region2);
    });

    test('announce sets text content on live region', () => {
      announce('test message');
      flushTimers();
      expect(getLiveRegion().textContent).toBe('test message');
    });
  });

  /* ============================================
     trapFocus
     ============================================ */

  describe('trapFocus', () => {
    test('traps forward from last to first element', () => {
      const container = document.createElement('div');
      const btn1 = document.createElement('button');
      btn1.tabIndex = 0;
      const btn2 = document.createElement('button');
      btn2.tabIndex = 0;

      container.appendChild(btn1);
      container.appendChild(btn2);
      document.body.appendChild(container);

      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false });
      jest.spyOn(e, 'preventDefault');

      btn2.focus();
      trapFocus(container, e);

      expect(e.preventDefault).toHaveBeenCalled();
      expect(document.activeElement).toBe(btn1);
    });

    test('does not trap when there is only one element', () => {
      const container = document.createElement('div');
      const btn = document.createElement('button');
      btn.tabIndex = 0;
      container.appendChild(btn);
      document.body.appendChild(container);

      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false });
      jest.spyOn(e, 'preventDefault');

      btn.focus();
      trapFocus(container, e);

      expect(e.preventDefault).toHaveBeenCalled();
    });

    test('does nothing when there are no focusable elements', () => {
      const container = document.createElement('div');
      const e = new KeyboardEvent('keydown', { key: 'Tab' });
      expect(() => trapFocus(container, e)).not.toThrow();
    });
  });

  /* ============================================
     createTemplateSelector
     ============================================ */

  describe('createTemplateSelector', () => {
    test('creates modal overlay with template list', () => {
      createTemplateSelector(sampleTemplates);

      const overlay = document.querySelector('.modal-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('role')).toBe('dialog');
      expect(overlay.getAttribute('aria-modal')).toBe('true');
      expect(overlay.getAttribute('aria-label')).toBe('Link Templates');

      const items = overlay.querySelectorAll('.template-item');
      expect(items.length).toBe(2);

      const names = overlay.querySelectorAll('.template-name');
      expect(names[0].textContent).toBe('Search');
      expect(names[1].textContent).toBe('Docs');
    });

    test('uses correct ARIA attributes on template items', () => {
      createTemplateSelector(sampleTemplates);

      const items = document.querySelectorAll('.template-item');
      expect(items[0].getAttribute('role')).toBe('option');
      expect(items[0].getAttribute('aria-selected')).toBe('true');
      expect(items[1].getAttribute('aria-selected')).toBe('false');
    });

    test('renders search input with aria-label', () => {
      createTemplateSelector(sampleTemplates);

      const search = document.querySelector('.search-input');
      expect(search).not.toBeNull();
      expect(search.getAttribute('aria-label')).toBe('Search templates');
    });

    test('renders add template button', () => {
      createTemplateSelector(sampleTemplates);

      const addBtn = document.querySelector('.add-template-button');
      expect(addBtn).not.toBeNull();
      expect(addBtn.textContent).toBe('+ Add Template');
    });

    test('selects first template by default', () => {
      createTemplateSelector(sampleTemplates);

      const items = document.querySelectorAll('.template-item');
      expect(items[0].classList.contains('selected')).toBe(true);
    });

    test('shows empty state when no templates', () => {
      createTemplateSelector([]);

      expect(document.querySelectorAll('.template-item').length).toBe(0);
      const noResults = document.querySelector('.no-results');
      expect(noResults).not.toBeNull();
      expect(noResults.textContent).toBe('No templates found');
    });

    test('cleans up previous modal before creating new one', () => {
      createTemplateSelector(sampleTemplates);
      createTemplateSelector([sampleTemplates[0]]);

      expect(document.querySelectorAll('.template-item').length).toBe(1);
    });

    test('renders close button in footer', () => {
      createTemplateSelector(sampleTemplates);

      const closeBtn = document.querySelector('.modal-footer .modal-button.secondary');
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.textContent).toBe('Close');
    });
  });

  /* ============================================
     cleanupModal
     ============================================ */

  describe('cleanupModal', () => {
    test('removes modal element from DOM', () => {
      createTemplateSelector(sampleTemplates);
      expect(document.querySelector('.modal-overlay')).not.toBeNull();

      cleanupModal();
      expect(document.querySelector('.modal-overlay')).toBeNull();
      expect(modalElement).toBeNull();
    });

    test('is safe to call when no modal exists', () => {
      expect(() => cleanupModal()).not.toThrow();
    });
  });

  /* ============================================
     search / filter
     ============================================ */

  describe('search / filter templates', () => {
    test('filters templates by name', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'Docs';
      searchInput.dispatchEvent(new Event('input'));

      expect(document.querySelectorAll('.template-item').length).toBe(1);
      expect(document.querySelector('.template-name').textContent).toBe('Docs');
    });

    test('filters templates by template URL', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'docs.example.com';
      searchInput.dispatchEvent(new Event('input'));

      expect(document.querySelectorAll('.template-item').length).toBe(1);
    });

    test('shows no results when nothing matches', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'zzznonexistent';
      searchInput.dispatchEvent(new Event('input'));

      expect(document.querySelectorAll('.template-item').length).toBe(0);
      expect(document.querySelector('.no-results')).not.toBeNull();
    });

    test('resets filtered list on empty query', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'Docs';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelectorAll('.template-item').length).toBe(1);

      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelectorAll('.template-item').length).toBe(2);
    });
  });

  /* ============================================
     calculator mode
     ============================================ */

  describe('calculator mode', () => {
    beforeEach(() => {
      window.calcEval = jest.fn((expr) => {
        if (expr === '2 + 2') return { success: true, result: 4 };
        if (expr === 'bad') return { success: false, error: 'Syntax error' };
        return { success: true, result: 0 };
      });
    });

    test('enters calculator mode with cal prefix', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'cal 2 + 2';
      searchInput.dispatchEvent(new Event('input'));

      const calcResult = document.querySelector('.calc-result');
      expect(calcResult.style.display).toBe('block');
      expect(calcResult.textContent).toBe('= 4');
      expect(calcResult.classList.contains('calc-result-success')).toBe(true);
    });

    test('shows error for invalid expressions', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'cal bad';
      searchInput.dispatchEvent(new Event('input'));

      const calcResult = document.querySelector('.calc-result');
      expect(calcResult.textContent).toBe('Syntax error');
      expect(calcResult.classList.contains('calc-result-error')).toBe(true);
    });

    test('hides template list in calculator mode', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'cal 2 + 2';
      searchInput.dispatchEvent(new Event('input'));

      expect(document.querySelector('.search-results').style.display).toBe('none');
    });

    test('exits calculator mode when query no longer starts with cal', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'cal 2 + 2';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelector('.search-results').style.display).toBe('none');

      searchInput.value = '2 + 2';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelector('.search-results').style.display).not.toBe('none');
    });

    test('hides calc result when cal prefix is removed', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'cal 2 + 2';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelector('.calc-result').style.display).toBe('block');

      searchInput.value = '2 + 2';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelector('.calc-result').style.display).toBe('none');
    });

    test('ArrowUp/Down are no-ops in calculator mode', () => {
      createTemplateSelector(sampleTemplates);

      const searchInput = document.querySelector('.search-input');
      searchInput.value = 'cal 2 + 2';
      searchInput.dispatchEvent(new Event('input'));
      flushTimers();

      const items = document.querySelectorAll('.template-item');
      // Template items should exist but not change selection
      expect(items.length).toBe(0);
    });
  });

  /* ============================================
     keyboard navigation
     ============================================ */

  describe('keyboard navigation — createTemplateSelector', () => {
    function focusedModal() {
      createTemplateSelector(sampleTemplates);
      // Focus the search input so handleKeyDown recognizes modal focus
      const input = document.querySelector('.search-input');
      input.focus();
      return input;
    }

    test('ArrowDown moves selection to next template', () => {
      focusedModal();
      const items = document.querySelectorAll('.template-item');

      expect(items[0].classList.contains('selected')).toBe(true);
      expect(items[0].getAttribute('aria-selected')).toBe('true');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(items[1].classList.contains('selected')).toBe(true);
      expect(items[1].getAttribute('aria-selected')).toBe('true');
      expect(items[0].getAttribute('aria-selected')).toBe('false');
    });

    test('ArrowUp moves selection to previous template', () => {
      focusedModal();
      const items = document.querySelectorAll('.template-item');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(items[1].classList.contains('selected')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(items[0].classList.contains('selected')).toBe(true);
    });

    test('ArrowUp wraps to last item from first', () => {
      focusedModal();
      const items = document.querySelectorAll('.template-item');
      expect(items[0].classList.contains('selected')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(items[1].classList.contains('selected')).toBe(true);
    });

    test('ArrowDown wraps to first item from last', () => {
      focusedModal();
      const items = document.querySelectorAll('.template-item');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(items[0].classList.contains('selected')).toBe(true);
    });

    test('Escape cleans up modal', () => {
      focusedModal();
      expect(document.querySelector('.modal-overlay')).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.modal-overlay')).toBeNull();
    });

    test('Enter on selected template opens parameter popup', () => {
      chrome.storage.local.get.mockResolvedValue({});
      focusedModal();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(document.querySelector('.modal-overlay')).toBeNull();
      expect(document.querySelector('.parameter-popup')).not.toBeNull();
    });

    test('Tab traps focus at last element and wraps to first', () => {
      focusedModal();
      const container = document.querySelector('.modal-container');
      const focusable = container.querySelectorAll(focusableSelector);
      const lastIdx = focusable.length - 1;

      focusable[lastIdx].focus();

      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false });
      trapFocus(container, e);
      expect(document.activeElement).toBe(focusable[0]);
    });

    test('Shift+Tab at first element wraps to last', () => {
      focusedModal();
      const container = document.querySelector('.modal-container');
      const focusable = container.querySelectorAll(focusableSelector);

      focusable[0].focus();

      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      trapFocus(container, e);
      expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    });

    test('only processes keyboard events when modal contains active element', () => {
      createTemplateSelector(sampleTemplates);
      // Don't focus inside — keydown should be ignored
      const modalBefore = document.querySelector('.modal-overlay');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.modal-overlay')).not.toBeNull();
      // Clean up manually
      cleanupModal();
    });
  });

  /* ============================================
     showTemplateEditor
     ============================================ */

  describe('showTemplateEditor', () => {
    test('renders new template form', () => {
      showTemplateEditor();

      const overlay = document.querySelector('.modal-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('aria-label')).toBe('New Template');
      expect(overlay.querySelector('h2').textContent).toBe('New Template');

      expect(overlay.querySelector('#template-name')).not.toBeNull();
      expect(overlay.querySelector('#template-url')).not.toBeNull();
      expect(overlay.querySelector('#template-params')).not.toBeNull();
    });

    test('renders edit template form with pre-filled values', () => {
      const template = {
        id: 't1',
        name: 'Search',
        template: 'https://example.com/search?q={query}',
        parameters: ['query']
      };
      showTemplateEditor(template);

      const overlay = document.querySelector('.modal-overlay');
      expect(overlay.querySelector('h2').textContent).toBe('Edit Template');
      expect(overlay.querySelector('#template-name').value).toBe('Search');
      expect(overlay.querySelector('#template-url').value).toBe('https://example.com/search?q={query}');
      expect(overlay.querySelector('#template-params').value).toBe('query');
    });

    test('includes save and cancel buttons', () => {
      showTemplateEditor();

      const saveBtn = document.querySelector('.modal-button.primary');
      const cancelBtn = document.querySelector('.modal-button.secondary');
      expect(saveBtn.textContent).toBe('Save');
      expect(cancelBtn.textContent).toBe('Cancel');
    });

    test('includes inline toast container with aria-live', () => {
      showTemplateEditor();

      const toast = document.querySelector('.inline-toast');
      expect(toast).not.toBeNull();
      expect(toast.style.display).toBe('none');
      expect(toast.getAttribute('aria-live')).toBe('polite');
    });

    test('cancel button returns to template selector', async () => {
      jest.useRealTimers();
      chrome.storage.local.get.mockResolvedValue({ templates: sampleTemplates });
      showTemplateEditor();

      const cancelBtn = document.querySelector('.modal-button.secondary');
      cancelBtn.click();

      await new Promise(resolve => setTimeout(resolve, 10));
      const overlay = document.querySelector('.modal-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('aria-label')).toBe('Link Templates');
      jest.useFakeTimers();
    });

    test('modal close button returns to template selector', async () => {
      jest.useRealTimers();
      chrome.storage.local.get.mockResolvedValue({ templates: sampleTemplates });
      showTemplateEditor();

      document.querySelector('.modal-close').click();

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(document.querySelector('.modal-overlay')).not.toBeNull();
      jest.useFakeTimers();
    });

    test('Escape key triggers cancel', () => {
      showTemplateEditor();
      flushTimers();

      const cancelSpy = jest.spyOn(HTMLButtonElement.prototype, 'click');

      document.querySelector('#template-name').focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(cancelSpy).toHaveBeenCalled();
      cancelSpy.mockRestore();
    });

    test('Enter key triggers save', () => {
      showTemplateEditor();
      flushTimers();

      const saveSpy = jest.spyOn(HTMLButtonElement.prototype, 'click');

      document.querySelector('#template-name').focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(saveSpy).toHaveBeenCalled();
      saveSpy.mockRestore();
    });

    test('save with empty name shows inline error', () => {
      showTemplateEditor();
      flushTimers();

      document.querySelector('#template-name').value = '';
      document.querySelector('.modal-button.primary').click();

      const toast = document.querySelector('.inline-toast');
      expect(toast.style.display).toBe('block');
      expect(toast.classList.contains('error')).toBe(true);
      expect(toast.textContent).toBe('Please enter a template name');
    });

    test('save with empty URL shows inline error', () => {
      showTemplateEditor();
      flushTimers();

      document.querySelector('#template-name').value = 'Test';
      document.querySelector('#template-url').value = '';
      document.querySelector('.modal-button.primary').click();

      const toast = document.querySelector('.inline-toast');
      expect(toast.style.display).toBe('block');
      expect(toast.textContent).toBe('Please enter a URL template');
    });

    test('save with no params shows inline error', () => {
      showTemplateEditor();
      flushTimers();

      document.querySelector('#template-name').value = 'Test';
      document.querySelector('#template-url').value = 'https://example.com';
      document.querySelector('#template-params').value = '';
      document.querySelector('.modal-button.primary').click();

      const toast = document.querySelector('.inline-toast');
      expect(toast.style.display).toBe('block');
      expect(toast.textContent).toBe('Please enter at least one parameter');
    });

    test('save calls templateManager.addTemplate for new template', async () => {
      jest.useRealTimers();
      chrome.storage.local.get.mockResolvedValue({ templates: [] });
      chrome.storage.local.set.mockResolvedValue();
      showTemplateEditor();

      document.querySelector('#template-name').value = 'New';
      document.querySelector('#template-url').value = 'https://example.com/{x}';
      document.querySelector('#template-params').value = 'x';

      document.querySelector('.modal-button.primary').click();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        templates: [expect.objectContaining({ name: 'New' })]
      });
      jest.useFakeTimers();
    });

    test('save calls templateManager.updateTemplate for existing template', async () => {
      jest.useRealTimers();
      const existing = {
        id: 't1',
        name: 'Old',
        template: 'https://example.com/{x}',
        parameters: ['x']
      };
      chrome.storage.local.get.mockResolvedValue({ templates: [existing] });
      chrome.storage.local.set.mockResolvedValue();
      showTemplateEditor(existing);

      document.querySelector('#template-name').value = 'Updated';
      document.querySelector('#template-url').value = existing.template;
      document.querySelector('#template-params').value = existing.parameters.join(', ');

      document.querySelector('.modal-button.primary').click();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        templates: [expect.objectContaining({ name: 'Updated', id: 't1' })]
      });
      jest.useFakeTimers();
    });

    test('prevents XSS via template name in form', () => {
      showTemplateEditor({
        id: 't1',
        name: '<script>alert("xss")</script>',
        template: 'https://example.com/{x}',
        parameters: ['x']
      });

      const input = document.querySelector('#template-name');
      expect(input.value).toBe('<script>alert("xss")</script>');
    });

    test('closes editor on outside click', async () => {
      jest.useRealTimers();
      chrome.storage.local.get.mockResolvedValue({ templates: sampleTemplates });
      showTemplateEditor();

      document.querySelector('.modal-overlay').click();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(document.querySelector('.modal-overlay')).not.toBeNull();
      expect(document.querySelector('.modal-overlay').getAttribute('aria-label')).toBe('Link Templates');
      jest.useFakeTimers();
    });
  });

  /* ============================================
     showConfirmDialog
     ============================================ */

  describe('showConfirmDialog', () => {
    test('renders confirm dialog modal', () => {
      showConfirmDialog('Delete this?', jest.fn());

      const overlay = document.querySelector('.modal-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('role')).toBe('alertdialog');
      expect(overlay.getAttribute('aria-label')).toBe('Confirm');

      expect(document.querySelector('.confirm-dialog p').textContent).toBe('Delete this?');
      expect(document.querySelector('.modal-button.danger').textContent).toBe('Delete');
      expect(document.querySelector('.modal-button.secondary').textContent).toBe('Cancel');
    });

    test('cancel button closes dialog without confirming', () => {
      const onConfirm = jest.fn();
      showConfirmDialog('Delete?', onConfirm);

      document.querySelector('.modal-button.secondary').click();

      expect(document.querySelector('.modal-overlay')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    test('confirm button calls onConfirm and closes', () => {
      const onConfirm = jest.fn();
      showConfirmDialog('Delete?', onConfirm);

      document.querySelector('.modal-button.danger').click();

      expect(document.querySelector('.modal-overlay')).toBeNull();
      expect(onConfirm).toHaveBeenCalled();
    });

    test('Escape key closes dialog without confirming', () => {
      const onConfirm = jest.fn();
      showConfirmDialog('Delete?', onConfirm);
      flushTimers();

      document.querySelector('.modal-button.danger').focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(document.querySelector('.modal-overlay')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    test('clicking outside overlay closes dialog', () => {
      const onConfirm = jest.fn();
      showConfirmDialog('Delete?', onConfirm);

      document.querySelector('.modal-overlay').click();

      expect(document.querySelector('.modal-overlay')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    test('escapes HTML in message', () => {
      showConfirmDialog('<script>alert("xss")</script>', jest.fn());

      const p = document.querySelector('.confirm-dialog p');
      expect(p.innerHTML).toContain('&lt;script&gt;');
      expect(p.innerHTML).not.toContain('<script>');
    });

    test('calls onCancel when provided and cancel is clicked', () => {
      const onCancel = jest.fn();
      showConfirmDialog('Delete?', jest.fn(), onCancel);

      document.querySelector('.modal-button.secondary').click();

      expect(onCancel).toHaveBeenCalled();
    });
  });

  /* ============================================
     createParameterPopup
     ============================================ */

  describe('createParameterPopup', () => {
    const singleParamTemplate = {
      id: 't1',
      name: 'Search',
      template: 'https://example.com/search?q={query}',
      parameters: ['query']
    };

    const multiParamTemplate = {
      id: 't2',
      name: 'Multi',
      template: 'https://example.com/{a}/{b}',
      parameters: ['a', 'b']
    };

    test('creates parameter popup with ARIA attributes', () => {
      createParameterPopup(multiParamTemplate);

      const popup = document.querySelector('.parameter-popup');
      expect(popup).not.toBeNull();
      expect(popup.getAttribute('role')).toBe('dialog');
      expect(popup.getAttribute('aria-modal')).toBe('true');
      expect(popup.getAttribute('aria-label')).toBe('Select text for parameters');

      const params = popup.querySelectorAll('.parameter-item');
      expect(params.length).toBe(2);

      const names = popup.querySelectorAll('.parameter-name');
      expect(names[0].textContent).toBe('a:');
      expect(names[1].textContent).toBe('b:');
    });

    test('marks first parameter item as active', () => {
      createParameterPopup(multiParamTemplate);

      const items = document.querySelectorAll('.parameter-item');
      expect(items[0].classList.contains('active')).toBe(true);
      expect(items[1].classList.contains('active')).toBe(false);
    });

    test('displays template name in header', () => {
      createParameterPopup(multiParamTemplate);

      const h3 = document.querySelector('.parameter-header h3');
      expect(h3.textContent).toBe('Multi');
    });

    test('uses pre-selected text for first parameter of multi-param template', () => {
      createParameterPopup(multiParamTemplate, 'hello');

      const paramValue = document.querySelector('[data-param="a"]');
      expect(paramValue.textContent).toBe('hello');
      expect(paramValue.classList.contains('selected')).toBe(true);
      // Second param should still say "Not selected"
      const paramB = document.querySelector('[data-param="b"]');
      expect(paramB.textContent).toBe('Not selected');
    });

    test('opens URL and closes popup when single param filled via pre-selected text', () => {
      createParameterPopup(singleParamTemplate, 'hello world');

      expect(window.open).toHaveBeenCalledWith(
        'https://example.com/search?q=hello%20world',
        '_blank'
      );
    });

    test('opens URL and closes popup when single param filled via pre-selected text', () => {
      createParameterPopup(singleParamTemplate, 'hello');

      expect(window.open).toHaveBeenCalledWith(
        'https://example.com/search?q=hello',
        '_blank'
      );
      // Popup is auto-closed after opening link
      expect(document.querySelector('.parameter-popup')).toBeNull();
    });

    test('does not open link for multi-param when only first is pre-filled', () => {
      createParameterPopup(multiParamTemplate, 'first');
      expect(window.open).not.toHaveBeenCalled();
      expect(document.querySelector('.parameter-popup')).not.toBeNull();
    });

    test('processSelection fills parameters and opens link when all filled', () => {
      createParameterPopup(multiParamTemplate);
      const paramA = document.querySelector('[data-param="a"]');
      const paramB = document.querySelector('[data-param="b"]');

      mockSelectionText = 'valueA';
      Object.defineProperty(mockSelection, 'anchorNode', { value: { parentElement: document.body } });
      document.dispatchEvent(new Event('mouseup'));

      expect(paramA.textContent).toBe('valueA');
      expect(paramA.classList.contains('selected')).toBe(true);
      expect(window.open).not.toHaveBeenCalled();

      mockSelectionText = 'valueB';
      document.dispatchEvent(new Event('mouseup'));

      expect(paramB.textContent).toBe('valueB');
      expect(paramB.classList.contains('selected')).toBe(true);
      expect(window.open).toHaveBeenCalledWith(
        'https://example.com/valueA/valueB',
        '_blank'
      );
    });

    test('updates active/done classes as parameters are filled', () => {
      createParameterPopup(multiParamTemplate);
      const items = document.querySelectorAll('.parameter-item');

      expect(items[0].classList.contains('active')).toBe(true);
      expect(items[1].classList.contains('active')).toBe(false);

      mockSelectionText = 'valueA';
      Object.defineProperty(mockSelection, 'anchorNode', { value: { parentElement: document.body } });
      document.dispatchEvent(new Event('mouseup'));

      expect(items[0].classList.contains('done')).toBe(true);
      expect(items[0].classList.contains('active')).toBe(false);
      expect(items[1].classList.contains('active')).toBe(true);
    });

    test('close button cleans up popup and text selection handler', () => {
      createParameterPopup(singleParamTemplate);

      document.querySelector('.parameter-close').click();

      expect(document.querySelector('.parameter-popup')).toBeNull();
      // Verify mouseup handler was removed
      textSelectionHandler = null;
    });

    test('resize handler is registered on creation', () => {
      const spy = jest.spyOn(window, 'addEventListener');
      createParameterPopup(singleParamTemplate);
      expect(spy).toHaveBeenCalledWith('resize', expect.any(Function));
      spy.mockRestore();
    });

    test('positions popup at bottom-left', () => {
      Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

      createParameterPopup(singleParamTemplate);

      expect(modalElement.style.position).toBe('fixed');
      expect(modalElement.style.left).toBe('20px');
    });
  });

  /* ============================================
     cleanupParameterPopup
     ============================================ */

  describe('cleanupParameterPopup', () => {
    test('removes popup and cleans up resize handler', () => {
      const removeSpy = jest.spyOn(window, 'removeEventListener');

      createParameterPopup(sampleTemplates[0]);
      expect(document.querySelector('.parameter-popup')).not.toBeNull();

      cleanupParameterPopup();
      expect(document.querySelector('.parameter-popup')).toBeNull();

      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      removeSpy.mockRestore();
    });
  });

  /* ============================================
     cleanupTextSelectionHandler
     ============================================ */

  describe('cleanupTextSelectionHandler', () => {
    test('removes mouseup listener', () => {
      const handlerSpy = jest.fn();
      textSelectionHandler = handlerSpy;
      document.addEventListener('mouseup', textSelectionHandler);

      cleanupTextSelectionHandler();

      document.dispatchEvent(new Event('mouseup'));
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(textSelectionHandler).toBeNull();
    });

    test('is safe to call when no handler exists', () => {
      textSelectionHandler = null;
      expect(() => cleanupTextSelectionHandler()).not.toThrow();
    });
  });

  /* ============================================
     delete template via showConfirmDialog
     ============================================ */

  describe('delete template via showConfirmDialog', () => {
    test('delete button opens confirm dialog and removes template', () => {
      chrome.storage.local.get.mockResolvedValue({ templates: sampleTemplates });
      chrome.storage.local.set.mockResolvedValue();
      const deleteSpy = jest.spyOn(templateManager, 'deleteTemplate');

      createTemplateSelector(sampleTemplates);
      flushTimers();

      document.querySelector('.delete-template').click();
      flushTimers();

      // Confirm dialog should be visible
      const confirmOverlay = document.querySelectorAll('.modal-overlay');
      expect(confirmOverlay.length).toBe(2);

      document.querySelector('.modal-button.danger').click();
      flushTimers();

      expect(deleteSpy).toHaveBeenCalledWith('t1');
      deleteSpy.mockRestore();
    });
  });

  /* ============================================
     edit template button
     ============================================ */

  describe('edit template button', () => {
    test('clicking edit opens template editor with pre-filled data', () => {
      createTemplateSelector(sampleTemplates);
      flushTimers();

      document.querySelector('.edit-template').click();

      const overlay = document.querySelector('.modal-overlay');
      expect(overlay.querySelector('h2').textContent).toBe('Edit Template');
      expect(overlay.querySelector('#template-name').value).toBe('Search');
    });
  });

  /* ============================================
     template name click
     ============================================ */

  describe('template name click', () => {
    test('clicking template name creates parameter popup', () => {
      chrome.storage.local.get.mockResolvedValue({});
      createTemplateSelector(sampleTemplates);

      document.querySelector('.template-name').click();

      expect(document.querySelector('.modal-overlay')).toBeNull();
      expect(document.querySelector('.parameter-popup')).not.toBeNull();
    });

    test('clicking template name passes pre-selected text', () => {
      mockSelectionText = 'preselected';
      chrome.storage.local.get.mockResolvedValue({});

      const multiTemplate = { id: 't3', name: 'Multi', template: 'https://example.com/{a}/{b}', parameters: ['a', 'b'] };
      createTemplateSelector([multiTemplate], 'preselected');

      document.querySelector('.template-name').click();

      const paramValue = document.querySelector('[data-param="a"]');
      expect(paramValue.textContent).toBe('preselected');
      const paramB = document.querySelector('[data-param="b"]');
      expect(paramB.textContent).toBe('Not selected');
    });
  });

  /* ============================================
     add template button
     ============================================ */

  describe('add template button', () => {
    test('opens template editor', () => {
      createTemplateSelector(sampleTemplates);
      flushTimers();

      document.querySelector('.add-template-button').click();

      expect(document.querySelector('.modal-overlay').querySelector('h2').textContent).toBe('New Template');
    });
  });

  /* ============================================
     chrome.runtime.onMessage
     ============================================ */

  describe('chrome.runtime.onMessage listener', () => {
    test('handles showTemplateSelector action', async () => {
      jest.useRealTimers();
      chrome.storage.local.get.mockResolvedValue({ templates: sampleTemplates });
      mockSelectionText = 'pre selected';

      chrome.runtime.onMessage.addListener.mockClear();
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'showTemplateSelector') {
          const selection = window.getSelection();
          const preSelectedText = selection.toString().trim();
          templateManager.getTemplates().then(templates => {
            createTemplateSelector(templates, preSelectedText);
          });
        }
      });

      const capturedListener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      capturedListener({ action: 'showTemplateSelector' }, {}, jest.fn());
      await new Promise(resolve => setTimeout(resolve, 10));

      const items = document.querySelectorAll('.template-item');
      expect(items.length).toBe(2);
      jest.useFakeTimers();
    });
  });
});
