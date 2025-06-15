let selectedTemplate = null;
let currentParameterIndex = 0;
let parameterValues = {};
let popupElement = null;
let modalElement = null;
let textSelectionHandler = null;
let modalKeyDownHandler = null;

// Create and show the template selector modal
function createTemplateSelector(templates) {
  // Clean up any existing modal and its listeners
  cleanupModal();
  
  modalElement = document.createElement('div');
  modalElement.className = 'modal-overlay';
  modalElement.setAttribute('role', 'dialog');
  modalElement.setAttribute('aria-modal', 'true');
  
  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-container';
  
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <h2>Link Templates</h2>
    <button class="modal-close" aria-label="Close">×</button>
  `;
  
  const content = document.createElement('div');
  content.className = 'modal-content';
  
  // Add template list
  const templateList = document.createElement('div');
  templateList.className = 'template-list';
  
  let selectedIndex = 0;
  const templateItems = [];
  
  templates.forEach((template, index) => {
    const templateItem = document.createElement('div');
    templateItem.className = 'template-item';
    templateItem.tabIndex = 0;
    templateItem.setAttribute('role', 'button');
    templateItem.setAttribute('aria-label', `Select template: ${template.name}`);
    templateItem.innerHTML = `
      <div class="template-name">${template.name}</div>
      <div class="template-actions">
        <button class="edit-template" data-id="${template.id}" aria-label="Edit template">✎</button>
        <button class="delete-template" data-id="${template.id}" aria-label="Delete template">×</button>
      </div>
    `;
    
    templateItem.dataset.templateIndex = index;
    
    templateItem.querySelector('.template-name').onclick = () => {
      selectedTemplate = template;
      cleanupModal();
      createParameterPopup(template);
    };
    
    templateItem.querySelector('.edit-template').onclick = (e) => {
      e.stopPropagation();
      showTemplateEditor(template);
    };
    
    templateItem.querySelector('.delete-template').onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete template "${template.name}"?`)) {
        templateManager.deleteTemplate(template.id).then(() => {
          const newTemplates = templates.filter(t => t.id !== template.id);
          createTemplateSelector(newTemplates);
        });
      }
    };
    
    templateList.appendChild(templateItem);
    templateItems.push(templateItem);
  });
  
  const addButton = document.createElement('button');
  addButton.className = 'add-template-button';
  addButton.textContent = '+ Add Template';
  addButton.onclick = () => showTemplateEditor();
  
  content.appendChild(templateList);
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

  // Store the last focused element before opening modal
  const previousActiveElement = document.activeElement;
  
  // Function to update selected template
  function updateSelectedTemplate(newIndex) {
    templateItems[selectedIndex].classList.remove('selected');
    selectedIndex = newIndex;
    templateItems[selectedIndex].classList.add('selected');
    templateItems[selectedIndex].focus();
    templateItems[selectedIndex].scrollIntoView({
      block: 'nearest',
      behavior: 'smooth'
    });
  }
  
  // Handle keyboard navigation
  function handleKeyDown(e) {
    if (!modalElement.contains(document.activeElement)) {
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        updateSelectedTemplate((selectedIndex - 1 + templateItems.length) % templateItems.length);
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        updateSelectedTemplate((selectedIndex + 1) % templateItems.length);
        break;
        
      case 'Enter':
        e.preventDefault();
        const template = templates[selectedIndex];
        selectedTemplate = template;
        cleanupModal();
        createParameterPopup(template);
        break;
        
      case 'Escape':
        e.preventDefault();
        cleanupModal();
        break;

      case 'Tab':
        e.preventDefault();
        const focusableElements = modalContainer.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusableElement = focusableElements[0];
        const lastFocusableElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstFocusableElement) {
            lastFocusableElement.focus();
          } else {
            const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
            focusableElements[currentIndex - 1].focus();
          }
        } else {
          if (document.activeElement === lastFocusableElement) {
            firstFocusableElement.focus();
          } else {
            const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
            focusableElements[currentIndex + 1].focus();
          }
        }
        break;
    }
  }
  
  // Add keyboard event listener to the document
  modalKeyDownHandler = handleKeyDown;
  document.addEventListener('keydown', modalKeyDownHandler, true);
  
  // Close modal when clicking outside
  const outsideClickHandler = (e) => {
    if (e.target === modalElement) {
      cleanupModal();
    }
  };
  modalElement.addEventListener('click', outsideClickHandler);
  
  // Close button handler
  header.querySelector('.modal-close').onclick = cleanupModal;
  
  // Select and focus first template
  updateSelectedTemplate(0);

  // Store cleanup function
  modalElement.cleanup = () => {
    document.removeEventListener('keydown', modalKeyDownHandler, true);
    modalElement.removeEventListener('click', outsideClickHandler);
    if (previousActiveElement) {
      previousActiveElement.focus();
    }
  };
}

// Clean up modal and its listeners
function cleanupModal() {
  if (modalElement) {
    if (modalElement.cleanup) {
      modalElement.cleanup();
    }
    document.body.removeChild(modalElement);
    modalElement = null;
    modalKeyDownHandler = null;
  }
}

// Show template editor modal
function showTemplateEditor(template = null) {
  // Clean up any existing modal and its listeners
  cleanupModal();
  
  modalElement = document.createElement('div');
  modalElement.className = 'modal-overlay';
  modalElement.setAttribute('role', 'dialog');
  modalElement.setAttribute('aria-modal', 'true');
  
  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-container';
  
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <h2>${template ? 'Edit Template' : 'New Template'}</h2>
    <button class="modal-close" aria-label="Close">×</button>
  `;
  
  const content = document.createElement('div');
  content.className = 'modal-content';
  
  // Create form elements
  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  nameGroup.innerHTML = `
    <label for="template-name">Name</label>
    <input type="text" id="template-name" value="${template?.name || ''}" placeholder="Template name">
  `;
  
  const urlGroup = document.createElement('div');
  urlGroup.className = 'form-group';
  urlGroup.innerHTML = `
    <label for="template-url">URL Template</label>
    <input type="text" id="template-url" value="${template?.template || ''}" placeholder="https://example.com/{param1}/{param2}">
  `;
  
  const paramsGroup = document.createElement('div');
  paramsGroup.className = 'form-group';
  paramsGroup.innerHTML = `
    <label for="template-params">Parameters (comma-separated)</label>
    <input type="text" id="template-params" value="${template?.parameters?.join(', ') || ''}" placeholder="param1, param2">
  `;
  
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

  // Store the last focused element
  const previousActiveElement = document.activeElement;
  
  // Get form elements
  const nameInput = content.querySelector('#template-name');
  const urlInput = content.querySelector('#template-url');
  const paramsInput = content.querySelector('#template-params');
  
  // Handle keyboard events
  function handleKeyDown(e) {
    if (!modalElement.contains(document.activeElement)) {
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      cancelButton.click();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveButton.click();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const focusableElements = [nameInput, urlInput, paramsInput, cancelButton, saveButton];
      const currentIndex = focusableElements.indexOf(document.activeElement);
      
      if (e.shiftKey) {
        const nextIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
        focusableElements[nextIndex].focus();
      } else {
        const nextIndex = (currentIndex + 1) % focusableElements.length;
        focusableElements[nextIndex].focus();
      }
    }
  }
  
  // Add keyboard event listener
  modalKeyDownHandler = handleKeyDown;
  document.addEventListener('keydown', modalKeyDownHandler, true);
  
  // Close modal when clicking outside
  const outsideClickHandler = (e) => {
    if (e.target === modalElement) {
      cancelButton.click();
    }
  };
  modalElement.addEventListener('click', outsideClickHandler);
  
  // Save button handler
  saveButton.onclick = async () => {
    const name = nameInput.value.trim();
    const templateUrl = urlInput.value.trim();
    const params = paramsInput.value
      .split(',')
      .map(p => p.trim())
      .filter(p => p);
    
    if (!name || !templateUrl || params.length === 0) {
      alert('Please fill in all fields');
      return;
    }
    
    const newTemplate = {
      name,
      template: templateUrl,
      parameters: params
    };
    
    try {
      if (template) {
        await templateManager.updateTemplate(template.id, newTemplate);
      } else {
        await templateManager.addTemplate(newTemplate);
      }
      const templates = await templateManager.getTemplates();
      cleanupModal();
      createTemplateSelector(templates);
    } catch (error) {
      alert('Error saving template: ' + error.message);
    }
  };
  
  // Cancel button handler
  cancelButton.onclick = async () => {
    const templates = await templateManager.getTemplates();
    cleanupModal();
    createTemplateSelector(templates);
  };
  
  // Close button handler
  header.querySelector('.modal-close').onclick = () => cancelButton.click();
  
  // Store cleanup function
  modalElement.cleanup = () => {
    document.removeEventListener('keydown', modalKeyDownHandler, true);
    modalElement.removeEventListener('click', outsideClickHandler);
    if (previousActiveElement) {
      previousActiveElement.focus();
    }
  };
  
  // Focus first input
  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
}

// Position parameter popup at bottom left
function positionParameterPopup() {
  if (!modalElement) return;
  
  const padding = 20;
  const rect = modalElement.getBoundingClientRect();
  
  // Ensure the popup stays within viewport
  const maxLeft = window.innerWidth - rect.width - padding;
  const maxBottom = window.innerHeight - rect.height - padding;
  
  modalElement.style.position = 'fixed';
  modalElement.style.bottom = `${padding}px`;
  modalElement.style.left = `${padding}px`;
  modalElement.style.top = 'auto';
  modalElement.style.right = 'auto';
  modalElement.style.transform = 'none';
  modalElement.style.margin = '0';
}

// Create parameter popup for template
function createParameterPopup(template) {
  // Clean up any existing modal and its listeners
  cleanupModal();
  
  // Clean up any existing text selection handler
  cleanupTextSelectionHandler();
  
  modalElement = document.createElement('div');
  modalElement.className = 'parameter-popup';
  modalElement.style.position = 'fixed';
  modalElement.style.bottom = '20px';
  modalElement.style.left = '20px';
  modalElement.style.top = 'auto';
  modalElement.style.right = 'auto';
  modalElement.style.transform = 'none';
  modalElement.style.margin = '0';
  
  const content = document.createElement('div');
  content.className = 'parameter-content';
  content.innerHTML = `
    <div class="parameter-header">
      <h3>Select Text for Parameters</h3>
      <button class="parameter-close" aria-label="Close">×</button>
    </div>
    <div class="parameter-list">
      ${template.parameters.map(param => `
        <div class="parameter-item">
          <span class="parameter-name">${param}:</span>
          <span class="parameter-value" data-param="${param}">Not selected</span>
        </div>
      `).join('')}
    </div>
  `;
  
  modalElement.appendChild(content);
  document.body.appendChild(modalElement);
  
  const closeButton = modalElement.querySelector('.parameter-close');
  const paramValues = new Map();
  let currentParameterIndex = 0;
  
  // Handle text selection
  function handleTextSelection(e) {
    // Get selection from the window
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // Only proceed if we have non-empty text selected and we're still selecting parameters
    if (selectedText && currentParameterIndex < template.parameters.length) {
      // Check if the selection is within an editable area (like Google Docs)
      const isEditableSelection = selection.anchorNode?.parentElement?.isContentEditable || 
                                selection.anchorNode?.parentElement?.closest('[contenteditable="true"]');
      
      // For editable areas, we need to check if the selection is complete
      if (isEditableSelection) {
        // Wait a short moment to ensure the selection is complete
        setTimeout(() => {
          const finalSelection = window.getSelection().toString().trim();
          if (finalSelection) {
            processSelection(finalSelection);
          }
        }, 50);
      } else {
        // For regular text, process immediately
        processSelection(selectedText);
      }
    }
  }

  // Process the selected text
  function processSelection(selectedText) {
    if (currentParameterIndex < template.parameters.length) {
      const currentParam = template.parameters[currentParameterIndex];
      paramValues.set(currentParam, selectedText);
      
      // Update the UI
      const paramElement = modalElement.querySelector(`[data-param="${currentParam}"]`);
      paramElement.textContent = selectedText;
      paramElement.classList.add('selected');
      
      // Move to next parameter
      currentParameterIndex++;
      
      // If all parameters are selected, generate and open the link
      if (currentParameterIndex >= template.parameters.length) {
        const url = template.template.replace(/\{(\w+)\}/g, (match, param) => {
          return encodeURIComponent(paramValues.get(param));
        });
        
        window.open(url, '_blank');
        cleanupTextSelectionHandler();
        cleanupParameterPopup();
      }
    }
  }
  
  // Add text selection handler
  textSelectionHandler = handleTextSelection;
  document.addEventListener('mouseup', textSelectionHandler);
  
  // Close button handler
  closeButton.onclick = () => {
    cleanupTextSelectionHandler();
    cleanupParameterPopup();
  };
  
  // Position the popup at bottom left
  positionParameterPopup();
}

// Clean up parameter popup
function cleanupParameterPopup() {
  if (modalElement) {
    document.body.removeChild(modalElement);
    modalElement = null;
  }
}

// Clean up text selection handler
function cleanupTextSelectionHandler() {
  if (textSelectionHandler) {
    document.removeEventListener('mouseup', textSelectionHandler);
    textSelectionHandler = null;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showTemplateSelector') {
    templateManager.getTemplates().then(templates => {
      createTemplateSelector(templates);
    });
  }
});
