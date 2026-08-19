/**
 * Maison Hygia Admin Dashboard - Toast Component
 */

class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.idCounter = 0;
    this.init();
  }
  
  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Notifications');
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
  }
  
  show(message, options = {}) {
    const id = ++this.idCounter;
    const type = options.type || 'info';
    const title = options.title;
    const duration = options.duration ?? 5000;
    const action = options.action;
    
    const icons = {
      success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.innerHTML = `
      <div class="toast-icon">${icons[type]}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
        <div class="toast-message">${this.escapeHtml(message)}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    
    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'btn btn-sm btn-ghost toast-action';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', () => {
        action.handler();
        this.dismiss(id);
      });
      toast.querySelector('.toast-content').appendChild(actionBtn);
    }
    
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.dismiss(id));
    
    this.container.appendChild(toast);
    this.toasts.set(id, { element: toast, timeout: null });
    
    // Auto dismiss
    if (duration > 0) {
      const timeout = setTimeout(() => this.dismiss(id), duration);
      this.toasts.get(id).timeout = timeout;
    }
    
    // Pause on hover
    toast.addEventListener('mouseenter', () => {
      if (this.toasts.get(id)?.timeout) {
        clearTimeout(this.toasts.get(id).timeout);
      }
    });
    
    toast.addEventListener('mouseleave', () => {
      if (duration > 0) {
        const timeout = setTimeout(() => this.dismiss(id), duration);
        this.toasts.get(id).timeout = timeout;
      }
    });
    
    return id;
  }
  
  dismiss(id) {
    const toastData = this.toasts.get(id);
    if (!toastData) return;
    
    if (toastData.timeout) {
      clearTimeout(toastData.timeout);
    }
    
    toastData.element.classList.add('removing');
    
    toastData.element.addEventListener('animationend', () => {
      if (toastData.element.parentNode) {
        toastData.element.parentNode.removeChild(toastData.element);
      }
      this.toasts.delete(id);
    });
  }
  
  dismissAll() {
    this.toasts.forEach((_, id) => this.dismiss(id));
  }
  
  // Convenience methods
  success(message, options = {}) {
    return this.show(message, { ...options, type: 'success' });
  }
  
  error(message, options = {}) {
    return this.show(message, { ...options, type: 'error', duration: 8000 });
  }
  
  warning(message, options = {}) {
    return this.show(message, { ...options, type: 'warning' });
  }
  
  info(message, options = {}) {
    return this.show(message, { ...options, type: 'info' });
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

// Singleton
const toast = new ToastManager();

export default toast;