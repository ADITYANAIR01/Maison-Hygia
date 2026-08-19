/**
 * Maison Hygia Admin Dashboard - Authentication Module
 * Handles Cognito Hosted UI, PKCE, token management
 */

import store from './store.js';

class Auth {
  constructor() {
    this.config = {
      // These should be set via environment or config
      domain: 'auth.maisonhygia.adityanair.tech',
      clientId: null, // Set via init()
      redirectUri: `${window.location.origin}/admin#callback`,
      logoutUri: `${window.location.origin}/admin#login`,
      scopes: 'openid email profile',
      tokenEndpoint: 'https://auth.maisonhygia.adityanair.tech/oauth2/token',
      logoutEndpoint: 'https://auth.maisonhygia.adityanair.tech/logout'
    };
    
    this._codeVerifier = null;
    this._refreshTimer = null;
  }
  
  init(config) {
    this.config = { ...this.config, ...config };
  }
  
  // PKCE Code Verifier & Challenge
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    this._codeVerifier = this.base64URLEncode(array);
    return this._codeVerifier;
  }
  
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64URLEncode(new Uint8Array(digest));
  }
  
  base64URLEncode(buffer) {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  // Build Authorization URL
  async buildAuthUrl() {
    if (!this.config.clientId) {
      throw new Error('Client ID not configured');
    }
    
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    // Store code verifier for token exchange
    sessionStorage.setItem('pkce_verifier', codeVerifier);
    
    const state = this.generateState();
    sessionStorage.setItem('oauth_state', state);
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: this.config.scopes,
      redirect_uri: this.config.redirectUri,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    
    return `https://${this.config.domain}/login?${params.toString()}`;
  }
  
  generateState() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return this.base64URLEncode(array);
  }
  
  // Exchange Authorization Code for Tokens
  async exchangeCodeForTokens(code, state) {
    const storedState = sessionStorage.getItem('oauth_state');
    const codeVerifier = sessionStorage.getItem('pkce_verifier');
    
    if (!storedState || storedState !== state) {
      throw new Error('Invalid OAuth state');
    }
    
    if (!codeVerifier) {
      throw new Error('PKCE code verifier not found');
    }
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code: code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier
    });
    
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error_description || 'Token exchange failed');
    }
    
    const tokens = await response.json();
    
    // Clean up PKCE
    sessionStorage.removeItem('pkce_verifier');
    sessionStorage.removeItem('oauth_state');
    
    return tokens;
  }
  
  // Refresh Access Token
  async refreshToken() {
    const refreshToken = store.getRefreshToken();
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: refreshToken
    });
    
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    
    if (!response.ok) {
      // Refresh failed, clear auth
      store.clearAuth();
      throw new Error('Token refresh failed');
    }
    
    const tokens = await response.json();
    store.setTokens(tokens);
    
    // Schedule next refresh
    this.scheduleTokenRefresh();
    
    return tokens;
  }
  
  // Schedule automatic token refresh
  scheduleTokenRefresh() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    
    const expiresAt = store.state.expiresAt;
    if (!expiresAt) return;
    
    // Refresh 5 minutes before expiry
    const delay = expiresAt - Date.now() - 5 * 60 * 1000;
    
    if (delay > 0) {
      this._refreshTimer = setTimeout(() => {
        this.refreshToken().catch(err => {
          console.error('Auto token refresh failed:', err);
        });
      }, delay);
    }
  }
  
  // Get User Info from ID Token
  parseIdToken(idToken) {
    try {
      const payload = idToken.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return {
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name || decoded['cognito:username'],
        role: decoded['custom:role'] || 'customer',
        groups: decoded['cognito:groups'] || []
      };
    } catch (e) {
      console.error('Failed to parse ID token:', e);
      return null;
    }
  }
  
  // Handle Callback
  async handleCallback(hash) {
    const params = new URLSearchParams(hash.replace('#', ''));
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    
    if (error) {
      throw new Error(errorDescription || error);
    }
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    const tokens = await this.exchangeCodeForTokens(code, state);
    store.setTokens(tokens);
    
    // Parse user from ID token
    const user = this.parseIdToken(tokens.id_token);
    if (user) {
      store.setUser(user);
    }
    
    // Schedule token refresh
    this.scheduleTokenRefresh();
    
    return { tokens, user };
  }
  
  // Sign Out
  async signOut() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    
    store.clearAuth();
    
    // Redirect to Cognito logout
    const logoutUrl = `https://${this.config.domain}/logout?` + new URLSearchParams({
      client_id: this.config.clientId,
      logout_uri: this.config.logoutUri
    }).toString();
    
    window.location.href = logoutUrl;
  }
  
  // Check if we're on callback route
  isCallbackRoute() {
    return window.location.hash.startsWith('#callback');
  }
  
  // Get auth header
  getAuthHeader() {
    const token = store.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

// Singleton
const auth = new Auth();

export default auth;