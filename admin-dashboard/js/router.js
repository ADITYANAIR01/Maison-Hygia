/**
 * Maison Hygia Admin Dashboard - Hash-based Router
 */

import store from './store.js';

class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.currentParams = {};
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    
    // Bind event listeners
    window.addEventListener('hashchange', () => this._handleHashChange());
    window.addEventListener('load', () => this._handleHashChange());
  }
  
  // Register route
  addRoute(path, handler, options = {}) {
    this.routes.set(path, { handler, options });
  }
  
  // Add multiple routes
  addRoutes(routes) {
    routes.forEach(({ path, handler, options }) => {
      this.addRoute(path, handler, options);
    });
  }
  
  // Navigation guards
  beforeEach(hook) {
    this.beforeEachHooks.push(hook);
  }
  
  afterEach(hook) {
    this.afterEachHooks.push(hook);
  }
  
  // Navigate to route
  navigate(path, replace = false) {
    if (replace) {
      window.location.replace(`${window.location.pathname}#${path}`);
    } else {
      window.location.hash = path;
    }
  }
  
  // Get current route
  getCurrentRoute() {
    return this.currentRoute;
  }
  
  // Get route params
  getParams() {
    return { ...this.currentParams };
  }
  
  // Generate URL with params
  generateUrl(path, params = {}) {
    let url = path;
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    });
    return `#${url}`;
  }
  
  // Handle hash change
  async _handleHashChange() {
    const hash = window.location.hash.slice(1) || '/';
    const [path, queryString] = hash.split('?');
    
    // Parse query params
    const queryParams = new URLSearchParams(queryString || '');
    const params = {};
    queryParams.forEach((value, key) => {
      params[key] = value;
    });
    
    // Find matching route
    const match = this._matchRoute(path);
    
    if (!match) {
      this._handle404(path);
      return;
    }
    
    this.currentParams = { ...match.params, ...params };
    
    // Run beforeEach hooks
    for (const hook of this.beforeEachHooks) {
      const result = await hook(match.route, this.currentParams);
      if (result === false) return; // Navigation cancelled
      if (typeof result === 'string') {
        this.navigate(result, true);
        return;
      }
    }
    
    // Update current route
    this.currentRoute = match.route;
    
    // Call handler
    try {
      await match.route.handler(this.currentParams);
    } catch (err) {
      console.error('Route handler error:', err);
      this._handleError(err);
    }
    
    // Run afterEach hooks
    for (const hook of this.afterEachHooks) {
      await hook(match.route, this.currentParams);
    }
  }
  
  // Match route with params
  _matchRoute(path) {
    // Exact match first
    if (this.routes.has(path)) {
      return { route: this.routes.get(path), params: {} };
    }
    
    // Pattern matching
    for (const [pattern, route] of this.routes) {
      const params = this._matchPattern(pattern, path);
      if (params !== null) {
        return { route, params };
      }
    }
    
    return null;
  }
  
  _matchPattern(pattern, path) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    
    if (patternParts.length !== pathParts.length) return null;
    
    const params = {};
    
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      
      if (patternPart.startsWith(':')) {
        const paramName = patternPart.slice(1);
        params[paramName] = decodeURIComponent(pathPart);
      } else if (patternPart !== pathPart) {
        return null;
      }
    }
    
    return params;
  }
  
  _handle404(path) {
    console.warn(`Route not found: ${path}`);
    this.navigate('/404', true);
  }
  
  _handleError(err) {
    // Could show error page or toast
    console.error('Router error:', err);
  }
  
  // Route guards
  static requireAuth(to, params) {
    if (!store.isAuthenticated()) {
      return '/login';
    }
    return true;
  }
  
  static requireRole(role) {
    return (to, params) => {
      if (!store.hasRole(role)) {
        return '/dashboard'; // Or 403 page
      }
      return true;
    };
  }
}

// Singleton
const router = new Router();

export default router;