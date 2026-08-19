/**
 * Maison Hygia Admin Dashboard - Modal Component
 */

export class Modal {
  constructor(options = {}) {
    this.options = {
      title: '',
      size: 'md', // sm, md, lg, xl, full
      closable: true,
      closeOnOverlayClick: true,
      closeOnEscape: true,
      destroyOnClose: false,
      ...options
    };
    
    this.element = null;
    this.isOpen = false;
    this._focusTrap = null;
    this._previousActiveElement = null;
    
    this.render();
  }
  
  render() {
    const sizeClasses = {
      sm: 'modal-sm',
      md: 'modal-md',
      lg: 'modal-lg',
      xl: 'modal-xl',
      full: 'modal-full'
    };
    
    const sizeClass = sizeClasses[this.options.size] || 'modal-md';
    
    this.element = document.createElement('div');
    this.element.className = 'modal-overlay';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'modal-title');
    this.element.innerHTML = `
      <div class="modal ${sizeClass}" role="document">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">${this.escapeHtml(this.options.title)}</h2>
          ${this.options.closable ? `
            <button class="modal-close" aria-label="Close modal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          ` : ''}
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer"></div>
      </div>
    `;
    
    this.modal = this.element.querySelector('.modal');
    this.body = this.element.querySelector('.modal-body');
    this.footer = this.element.querySelector('.modal-footer');
    this.closeBtn = this.element.querySelector('.modal-close');
    
    // Initially hidden
    this.element.style.display = 'none';
  }
  
  setContent(content) {
    if (typeof content === 'string') {
      this.body.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      this.body.innerHTML = '';
      this.body.appendChild(content);
    }
  }
  
  setFooter(content) {
    if (typeof content === 'string') {
      this.footer.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      this.footer.innerHTML = '';
      this.footer.appendChild(content);
    }
  }
  
  setTitle(title) {
    this.options.title = title;
    const titleEl = this.element.querySelector('#modal-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }
  
  open() {
    if (this.isOpen) return;
    
    this._previousActiveElement = document.activeElement;
    
    document.body.appendChild(this.element);
    this.element.style.display = 'flex';
    
    // Force reflow for animation
    this.element.offsetHeight;
    
    this.element.classList.add('open');
    this.isOpen = true;
    
    // Trap focus
    this._setupFocusTrap();
    
    // Focus first focusable element
    this._focusFirstElement();
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Emit event
    this.element.dispatchEvent(new CustomEvent('modal:open', { detail: this }));
  }
  
  close() {
    if (!this.isOpen) return;
    
    this.element.classList.remove('open');
    
    // Wait for animation
    setTimeout(() => {
      this.element.style.display = 'none';
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      
      this.isOpen = false;
      
      // Restore focus
      if (this._previousActiveElement) {
        this._previousActiveElement.focus();
      }
      
      // Restore body scroll
      document.body.style.overflow = '';
      
      // Cleanup focus trap
      this._cleanupFocusTrap();
      
      // Emit event
      this.element.dispatchEvent(new CustomEvent('modal:close', { detail: this }));
      
      if (this.options.destroyOnClose) {
        this.destroy();
      }
    }, 250);
  }
  
  _setupFocusTrap() {
    this._focusTrap = (e) => {
      if (e.key !== 'Tab') return;
      
      const focusableElements = this.modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    document.addEventListener('keydown', this._focusTrap);
    
    // Close on Escape
    if (this.options.closeOnEscape) {
      this._escapeHandler = (e) => {
        if (e.key === 'Escape') {
          this.close();
        }
      };
      document.addEventListener('keydown', this._escapeHandler);
    }
    
    // Close on overlay click
    if (this.options.closeOnOverlayClick) {
      this._overlayClickHandler = (e) => {
        if (e.target === this.element) {
          this.close();
        }
      };
      this.element.addEventListener('click', this._overlayClickHandler);
    }
    
    // Close button
    if (this.closeBtn) {
      this._closeClickHandler = () => this.close();
      this.closeBtn.addEventListener('click', this._closeClickHandler);
    }
  }
  
  _cleanupFocusTrap() {
    if (this._focusTrap) {
      document.removeEventListener('keydown', this._focusTrap);
      this._focusTrap = null;
    }
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._overlayClickHandler) {
      this.element.removeEventListener('click', this._overlayClickHandler);
      this._overlayClickHandler = null;
    }
    if (this._closeClickHandler && this.closeBtn) {
      this.closeBtn.removeEventListener('click', this._closeClickHandler);
      this._closeClickHandler = null;
    }
  }
  
  _focusFirstElement() {
    const focusableElements = this.modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }
  
  destroy() {
    this.close();
    this._cleanupFocusTrap();
    this.element = null;
    this.modal = null;
    this.body = null;
    this.footer = null;
    this.closeBtn = null;
  }
  
  // Static helper methods
  static alert(title, message, options = {}) {
    return new Promise((resolve) => {
      const modal = new Modal({
        title,
        size: 'sm',
        destroyOnClose: true,
        ...options
      });
      
      modal.setContent(`
        <div style="padding: var(--space-4);">
          <p style="margin: 0; color: var(--color-text-secondary);">${modal.escapeHtml(message)}</p>
        </div>
      `);
      
      modal.setFooter(`
        <button class="btn btn-primary" data-action="ok">OK</button>
      `);
      
      modal.element.querySelector('[data-action="ok"]').addEventListener('click', () => {
        modal.close();
        resolve(true);
      });
      
      modal.open();
    });
  }
  
  static confirm(title, message, options = {}) {
    return new Promise((resolve) => {
      const modal = new Modal({
        title,
        size: 'sm',
        destroyOnClose: true,
        ...options
      });
      
      modal.setContent(`
        <div style="padding: var(--space-4);">
          <p style="margin: 0; color: var(--color-text-secondary);">${modal.escapeHtml(message)}</p>
        </div>
      `);
      
      modal.setFooter(`
        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn btn-${options.danger ? 'danger' : 'primary'}" data-action="confirm">
          ${options.confirmText || 'Confirm'}
        </button>
      `);
      
      modal.element.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        modal.close();
        resolve(false);
      });
      
      modal.element.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        modal.close();
        resolve(true);
      });
      
      modal.open();
    });
  }
  
  static prompt(title, message, defaultValue = '', options = {}) {
    return new Promise((resolve) => {
      const modal = new Modal({
        title,
        size: 'sm',
        destroyOnClose: true,
        ...options
      });
      
      const inputId = 'modal-prompt-input';
      
      modal.setContent(`
        <div style="padding: var(--space-4);">
          <p style="margin: 0 0 var(--space-4); color: var(--color-text-secondary);">${modal.escapeHtml(message)}</p>
          <input type="text" id="${inputId}" class="form-input" value="${modal.escapeHtml(defaultValue)}" autocomplete="off">
        </div>
      `);
      
      modal.setFooter(`
        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn btn-primary" data-action="confirm">${options.confirmText || 'OK'}</button>
      `);
      
      const input = modal.element.querySelector(`#${inputId}`);
      input.focus();
      input.select();
      
      const handleConfirm = () => {
        const value = input.value;
        modal.close();
        resolve(value);
      };
      
      modal.element.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        modal.close();
        resolve(null);
      });
      
      modal.element.querySelector('[data-action="confirm"]').addEventListener('click', handleConfirm);
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleConfirm();
        }
      });
      
      modal.open();
    });
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

export default Modal;