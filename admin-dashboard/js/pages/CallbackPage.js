/**
 * Maison Hygia Admin Dashboard - Callback Page
 */

import auth from '../auth.js';
import store from '../store.js';
import { Modal } from '../components/Modal.js';

export class CallbackPage {
  constructor(container) {
    this.container = container;
    this.render();
    this.handleCallback();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="callback-page">
        <div class="callback-card">
          <div class="callback-spinner" aria-label="Loading"></div>
          <h2 class="callback-title">Completing Sign In</h2>
          <p class="callback-message">Please wait while we verify your credentials...</p>
        </div>
      </div>
    `;
  }
  
  async handleCallback() {
    const hash = window.location.hash;
    
    try {
      const { user } = await auth.handleCallback(hash);
      
      // Success - redirect to dashboard
      window.location.hash = '#dashboard';
    } catch (err) {
      console.error('Callback error:', err);
      
      this.container.innerHTML = `
        <div class="callback-page">
          <div class="callback-card">
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <h2 class="callback-title">Sign In Failed</h2>
            <p class="callback-message" style="color: var(--color-error);">${this.escapeHtml(err.message)}</p>
            <button class="btn btn-primary" id="retryBtn" style="margin-top: var(--space-4);">Try Again</button>
          </div>
        </div>
      `;
      
      this.container.querySelector('#retryBtn').addEventListener('click', () => {
        window.location.hash = '#login';
      });
    }
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
  destroy() {
    // Cleanup if needed
  }
}

export default CallbackPage;