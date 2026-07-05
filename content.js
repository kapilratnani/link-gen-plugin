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
        const result = window.calcEval(expr);
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
          const trimmed = searchInput.value.trim();
          if (trimmed) {
            const resultText = calcResult.textContent;
            if (resultText && calcResult.style.display !== 'none') {
              navigator.clipboard.writeText(resultText).catch(() => {});
              announce('Result ' + resultText + ' copied to clipboard');
            }
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
    announce(msg);
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
        announce(`Updated template "${data.name}"`);
      } else {
        await templateManager.addTemplate(data);
        announce(`Created template "${data.name}"`);
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
        announce('All parameters filled, opening link');
        cleanupTextSelectionHandler();
        openLinkForTemplate(template, paramValues);
      } else {
        updateActiveItem(template);
        announce(`Selected "${selectedText}" for ${currentParam}. Now select ${template.parameters[currentParameterIndex]}`);
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
    announce('Cancelled parameter selection');
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

  announce(`Select text for "${template.parameters[currentParameterIndex]}"`);
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showTemplateSelector') {
    const selection = window.getSelection();
    const preSelectedText = selection.toString().trim();

    templateManager.getTemplates().then(templates => {
      createTemplateSelector(templates, preSelectedText);
    });
  }
});
