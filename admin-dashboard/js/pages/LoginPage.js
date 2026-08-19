/**
 * Maison Hygia Admin Dashboard - Login Page
 */

import auth from '../auth.js';
import store from '../store.js';
import { Modal } from '../components/Modal.js';

export class LoginPage {
  constructor(container) {
    this.container = container;
    this.render();
    this.bindEvents();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-header">
            <img src="assets/logo.svg" alt="Maison Hygia" class="login-logo" width="80" height="80">
            <h1 class="login-title">Admin Dashboard</h1>
            <p class="login-subtitle">Sign in to manage your store</p>
          </div>
          
          <form class="login-form" id="loginForm">
            <div class="form-group">
              <button type="button" class="btn btn-primary btn-lg" id="cognitoLoginBtn" style="width: 100%;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
                Sign in with Cognito
              </button>
            </div>
          </form>
          
          <div class="login-form">
            <p style="font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0;">
              You will be redirected to the Cognito hosted sign-in page.
            </p>
          </div>
          
          <p class="login-footer">
            <a href="#" id="forgotPasswordLink">Forgot password?</a>
          </p>
        </div>
      </div>
    `;
    
    this.cognitoLoginBtn = this.container.querySelector('#cognitoLoginBtn');
    this.forgotPasswordLink = this.container.querySelector('#forgotPasswordLink');
  }
  
  bindEvents() {
    this.cognitoLoginBtn.addEventListener('click', () => this.handleCognitoLogin());
    this.forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      Modal.alert('Reset Password', 'Password reset functionality would be handled by Cognito Hosted UI.');
    });
  }
  
  async handleCognitoLogin() {
    this.cognitoLoginBtn.disabled = true;
    this.cognitoLoginBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span> Redirecting...';
    
    try {
      const authUrl = await auth.buildAuthUrl();
      window.location.href = authUrl;
    } catch (err) {
      console.error('Auth URL build failed:', err);
      Modal.alert('Error', 'Failed to initiate login. Please try again.');
      this.cognitoLoginBtn.disabled = false;
      this.cognitoLoginBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>
        Sign in with Cognito
      `;
    }
  }
  
  destroy() {
    // Cleanup if needed
  }
}

export default LoginPage;