/**
 * Maison Hygia Admin Dashboard - Form Component
 * Handles form rendering, validation, and submission
 */

export class Form {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      fields: [],
      initialValues: {},
      validateOnChange: true,
      validateOnBlur: true,
      onSubmit: null,
      onChange: null,
      ...options
    };
    
    this.values = { ...this.options.initialValues };
    this.errors = {};
    this.touched = {};
    this.submitting = false;
    
    this.render();
    this.bindEvents();
  }
  
  render() {
    const { fields } = this.options;
    
    const fieldsHtml = fields.map(field => this.renderField(field)).join('');
    
    this.container.innerHTML = `
      <form class="form" novalidate>
        ${fieldsHtml}
      </form>
    `;
    
    this.form = this.container.querySelector('form');
    this._attachFieldElements();
  }
  
  renderField(field) {
    const { type = 'text', name, label, placeholder, required, disabled, options, rows, hint, error, className } = field;
    const value = this.values[name] ?? '';
    const fieldError = this.errors[name];
    const isTouched = this.touched[name];
    const hasError = fieldError && isTouched;
    
    const wrapperClass = `form-group${className ? ` ${className}` : ''}`;
    
    let inputHtml = '';
    const inputId = `form-${name}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    
    const commonAttrs = `
      id="${inputId}"
      name="${name}"
      ${placeholder ? `placeholder="${this.escapeHtml(placeholder)}"` : ''}
      ${required ? 'required' : ''}
      ${disabled ? 'disabled' : ''}
      ${hasError ? `aria-invalid="true" aria-describedby="${errorId}"` : ''}
      ${hint && !hasError ? `aria-describedby="${hintId}"` : ''}
    `;
    
    switch (type) {
      case 'textarea':
        inputHtml = `<textarea class="form-input form-textarea" rows="${rows || 4}" ${commonAttrs}>${this.escapeHtml(value)}</textarea>`;
        break;
      case 'select':
        const optionsHtml = (options || []).map(opt => 
          `<option value="${this.escapeHtml(opt.value)}" ${opt.value === value ? 'selected' : ''}>${this.escapeHtml(opt.label)}</option>`
        ).join('');
        inputHtml = `<select class="form-input form-select" ${commonAttrs}>${optionsHtml}</select>`;
        break;
      case 'checkbox':
        inputHtml = `
          <div class="form-check">
            <input type="checkbox" class="form-check-input" ${commonAttrs} ${value ? 'checked' : ''} value="true">
            <label class="form-check-label" for="${inputId}">${this.escapeHtml(label)}</label>
          </div>
        `;
        break;
      case 'switch':
        inputHtml = `
          <label class="form-switch">
            <input type="checkbox" class="form-switch-input" ${commonAttrs} ${value ? 'checked' : ''}>
            <span class="form-switch-track"></span>
            <span class="form-switch-label">${this.escapeHtml(label)}</span>
          </label>
        `;
        break;
      case 'file':
        inputHtml = `
          <div class="file-upload" data-field="${name}">
            <input type="file" class="file-upload-input" ${commonAttrs} ${field.multiple ? 'multiple' : ''}>
            <svg class="file-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p class="file-upload-text">Drag & drop or click to upload</p>
            <p class="file-upload-hint">${field.accept ? `Accepted: ${field.accept}` : 'Max 10MB'}</p>
            <div class="file-preview"></div>
          </div>
        `;
        break;
      default:
        inputHtml = `<input type="${type}" class="form-input" value="${this.escapeHtml(value)}" ${commonAttrs}>`;
    }
    
    const labelHtml = type !== 'checkbox' && type !== 'switch' && label ? 
      `<label class="form-label" for="${inputId}">${this.escapeHtml(label)}${required ? '<span class="form-required"></span>' : ''}</label>` : '';
    
    const errorHtml = hasError ? `<div class="form-error" id="${errorId}" role="alert">${this.escapeHtml(fieldError)}</div>` : '';
    const hintHtml = hint && !hasError ? `<div class="form-hint" id="${hintId}">${this.escapeHtml(hint)}</div>` : '';
    
    return `
      <div class="${wrapperClass}">
        ${labelHtml}
        ${inputHtml}
        ${errorHtml}
        ${hintHtml}
      </div>
    `;
  }
  
  _attachFieldElements() {
    this.fieldElements = {};
    this.options.fields.forEach(field => {
      const input = this.form.querySelector(`[name="${field.name}"]`);
      if (input) {
        this.fieldElements[field.name] = input;
      }
    });
  }
  
  bindEvents() {
    // Input change
    this.form.addEventListener('input', (e) => {
      const input = e.target;
      const name = input.name;
      if (!name) return;
      
      let value;
      if (input.type === 'checkbox' && !input.classList.contains('form-switch-input')) {
        value = input.checked;
      } else if (input.type === 'file') {
        value = input.files;
      } else {
        value = input.value;
      }
      
      this.values[name] = value;
      this.validateField(name);
      
      if (this.options.onChange) {
        this.options.onChange(name, value, this.values);
      }
    });
    
    // Blur validation
    this.form.addEventListener('blur', (e) => {
      const input = e.target;
      const name = input.name;
      if (!name) return;
      
      this.touched[name] = true;
      this.validateField(name);
    }, true);
    
    // Form submit
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    
    // File upload handling
    this.form.querySelectorAll('.file-upload').forEach(upload => {
      const input = upload.querySelector('.file-upload-input');
      const fieldName = upload.dataset.field;
      
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        upload.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      });
      
      ['dragenter', 'dragover'].forEach(eventName => {
        upload.addEventListener(eventName, () => upload.classList.add('drag-active'));
      });
      
      ['dragleave', 'drop'].forEach(eventName => {
        upload.addEventListener(eventName, () => upload.classList.remove('drag-active'));
      });
      
      upload.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          input.files = files;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          this._handleFilePreview(upload, files);
        }
      });
      
      input.addEventListener('change', () => {
        if (input.files.length > 0) {
          this._handleFilePreview(upload, input.files);
        }
      });
    });
  }
  
  _handleFilePreview(upload, files) {
    const preview = upload.querySelector('.file-preview');
    preview.innerHTML = '';
    
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const item = document.createElement('div');
          item.className = 'file-preview-item';
          item.innerHTML = `
            <img src="${e.target.result}" alt="${this.escapeHtml(file.name)}">
            <button type="button" class="file-preview-remove" aria-label="Remove file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          `;
          item.querySelector('.file-preview-remove').addEventListener('click', () => {
            // Clear the file input
            const input = upload.querySelector('.file-upload-input');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            preview.innerHTML = '';
            upload.classList.remove('has-image');
          });
          preview.appendChild(item);
        };
        reader.readAsDataURL(file);
      } else {
        const item = document.createElement('div');
        item.className = 'file-preview-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'center';
        item.textContent = file.name;
        preview.appendChild(item);
      }
    });
    
    if (files.length > 0) {
      upload.classList.add('has-image');
    }
  }
  
  validateField(name) {
    const field = this.options.fields.find(f => f.name === name);
    if (!field || !field.validate) return true;
    
    const value = this.values[name];
    const error = field.validate(value, this.values);
    
    if (error) {
      this.errors[name] = error;
    } else {
      delete this.errors[name];
    }
    
    this._updateFieldError(name);
    return !error;
  }
  
  validateAll() {
    let isValid = true;
    this.options.fields.forEach(field => {
      this.touched[field.name] = true;
      if (!this.validateField(field.name)) {
        isValid = false;
      }
    });
    this.render(); // Re-render to show all errors
    return isValid;
  }
  
  _updateFieldError(name) {
    const input = this.fieldElements[name];
    const errorEl = this.form.querySelector(`#form-${name}-error`);
    const hintEl = this.form.querySelector(`#form-${name}-hint`);
    const error = this.errors[name];
    const isTouched = this.touched[name];
    
    if (input) {
      if (error && isTouched) {
        input.classList.add('error');
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', `form-${name}-error`);
        if (hintEl) hintEl.style.display = 'none';
      } else {
        input.classList.remove('error');
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
        if (hintEl) hintEl.style.display = '';
      }
    }
    
    if (errorEl) {
      if (error && isTouched) {
        errorEl.textContent = error;
        errorEl.style.display = 'flex';
      } else {
        errorEl.style.display = 'none';
      }
    }
  }
  
  async submit() {
    if (this.submitting) return;
    
    const isValid = this.validateAll();
    if (!isValid) return;
    
    this.submitting = true;
    this._setSubmittingState(true);
    
    try {
      if (this.options.onSubmit) {
        await this.options.onSubmit(this.values, this);
      }
    } catch (err) {
      console.error('Form submit error:', err);
      if (err.errors) {
        // Server-side validation errors
        Object.entries(err.errors).forEach(([field, message]) => {
          this.errors[field] = message;
          this.touched[field] = true;
        });
        this.render();
      }
    } finally {
      this.submitting = false;
      this._setSubmittingState(false);
    }
  }
  
  _setSubmittingState(submitting) {
    const submitBtn = this.form.querySelector('button[type="submit"], .btn-primary');
    if (submitBtn) {
      submitBtn.disabled = submitting;
      if (submitting) {
        submitBtn.dataset.originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span> Submitting...';
      } else if (submitBtn.dataset.originalText) {
        submitBtn.innerHTML = submitBtn.dataset.originalText;
      }
    }
    
    // Disable all inputs
    this.form.querySelectorAll('input, select, textarea, button').forEach(el => {
      if (el !== submitBtn) {
        el.disabled = submitting;
      }
    });
  }
  
  setValue(name, value) {
    this.values[name] = value;
    const input = this.fieldElements[name];
    if (input) {
      if (input.type === 'checkbox') {
        input.checked = value;
      } else {
        input.value = value;
      }
    }
  }
  
  getValues() {
    return { ...this.values };
  }
  
  setErrors(errors) {
    this.errors = { ...errors };
    Object.keys(errors).forEach(key => {
      this.touched[key] = true;
    });
    this.render();
  }
  
  reset() {
    this.values = { ...this.options.initialValues };
    this.errors = {};
    this.touched = {};
    this.render();
  }
  
  destroy() {
    // Cleanup if needed
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

export default Form;