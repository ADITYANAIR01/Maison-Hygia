/**
 * Maison Hygia Admin Dashboard - State Store
 * Reactive proxy-based state management
 */

class Store {
  constructor() {
    this._state = {
      // Auth state
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      expiresAt: null,
      
      // UI state
      theme: 'light',
      sidebarOpen: false,
      sidebarCollapsed: false,
      loading: false,
      
      // Data state
      dashboard: {
        kpis: null,
        revenueChart: null,
        recentOrders: null
      },
      products: {
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        filters: {}
      },
      orders: {
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        filters: {}
      },
      users: {
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        filters: {}
      },
      inventory: {
        list: [],
        total: 0,
        page: 1,
        pageSize: 50,
        filters: {},
        bulkMode: false,
        selectedIds: new Set()
      },
      settings: {
        siteConfig: null,
        emailTemplates: []
      }
    };
    
    this._subscribers = new Map();
    this._initFromStorage();
  }
  
  _initFromStorage() {
    try {
      const theme = localStorage.getItem('theme') || 'light';
      this._state.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      
      const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      this._state.sidebarCollapsed = sidebarCollapsed;
      
      // Restore auth from sessionStorage
      const accessToken = sessionStorage.getItem('access_token');
      const refreshToken = sessionStorage.getItem('refresh_token');
      const idToken = sessionStorage.getItem('id_token');
      const expiresAt = sessionStorage.getItem('expires_at');
      const userStr = sessionStorage.getItem('user');
      
      if (accessToken && expiresAt && Date.now() < parseInt(expiresAt)) {
        this._state.isAuthenticated = true;
        this._state.accessToken = accessToken;
        this._state.refreshToken = refreshToken;
        this._state.idToken = idToken;
        this._state.expiresAt = parseInt(expiresAt);
        if (userStr) {
          this._state.user = JSON.parse(userStr);
        }
      }
    } catch (e) {
      console.warn('Failed to restore state from storage:', e);
    }
  }
  
  // Proxy handler for reactivity
  get state() {
    return new Proxy(this._state, {
      get: (target, prop) => {
        if (prop === 'subscribe') return this.subscribe.bind(this);
        if (prop === 'unsubscribe') return this.unsubscribe.bind(this);
        return target[prop];
      },
      set: (target, prop, value) => {
        const oldValue = target[prop];
        target[prop] = value;
        this._notify(prop, value, oldValue);
        return true;
      }
    });
  }
  
  subscribe(key, callback) {
    if (!this._subscribers.has(key)) {
      this._subscribers.set(key, new Set());
    }
    this._subscribers.get(key).add(callback);
    
    return () => this.unsubscribe(key, callback);
  }
  
  unsubscribe(key, callback) {
    if (this._subscribers.has(key)) {
      this._subscribers.get(key).delete(callback);
    }
  }
  
  _notify(key, newValue, oldValue) {
    if (this._subscribers.has(key)) {
      this._subscribers.get(key).forEach(cb => {
        try {
          cb(newValue, oldValue);
        } catch (e) {
          console.error(`Subscriber error for ${key}:`, e);
        }
      });
    }
    
    // Also notify wildcard subscribers
    if (this._subscribers.has('*')) {
      this._subscribers.get('*').forEach(cb => {
        try {
          cb(key, newValue, oldValue);
        } catch (e) {
          console.error('Wildcard subscriber error:', e);
        }
      });
    }
  }
  
  // Auth methods
  getAccessToken() {
    return this._state.accessToken;
  }
  
  getRefreshToken() {
    return this._state.refreshToken;
  }
  
  getIdToken() {
    return this._state.idToken;
  }
  
  isTokenExpired() {
    if (!this._state.expiresAt) return true;
    // 5 minute buffer
    return Date.now() >= (this._state.expiresAt - 5 * 60 * 1000);
  }
  
  setTokens(tokens) {
    const { access_token, refresh_token, id_token, expires_in } = tokens;
    const expiresAt = Date.now() + (expires_in * 1000);
    
    this._state.accessToken = access_token;
    this._state.refreshToken = refresh_token;
    this._state.idToken = id_token;
    this._state.expiresAt = expiresAt;
    this._state.isAuthenticated = true;
    
    sessionStorage.setItem('access_token', access_token);
    sessionStorage.setItem('refresh_token', refresh_token);
    sessionStorage.setItem('id_token', id_token);
    sessionStorage.setItem('expires_at', expiresAt.toString());
  }
  
  setUser(user) {
    this._state.user = user;
    sessionStorage.setItem('user', JSON.stringify(user));
  }
  
  clearAuth() {
    this._state.isAuthenticated = false;
    this._state.user = null;
    this._state.accessToken = null;
    this._state.refreshToken = null;
    this._state.idToken = null;
    this._state.expiresAt = null;
    
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('id_token');
    sessionStorage.removeItem('expires_at');
    sessionStorage.removeItem('user');
  }
  
  getUser() {
    return this._state.user;
  }
  
  hasRole(role) {
    if (!this._state.user) return false;
    if (role === 'admin') return this._state.user.role === 'admin';
    return this._state.user.role === role;
  }
  
  isAuthenticated() {
    return this._state.isAuthenticated && !this.isTokenExpired();
  }
  
  // Theme methods
  setTheme(theme) {
    this._state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }
  
  toggleTheme() {
    this.setTheme(this._state.theme === 'light' ? 'dark' : 'light');
  }
  
  // Sidebar methods
  toggleSidebar() {
    this._state.sidebarOpen = !this._state.sidebarOpen;
  }
  
  closeSidebar() {
    this._state.sidebarOpen = false;
  }
  
  toggleSidebarCollapsed() {
    this._state.sidebarCollapsed = !this._state.sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', this._state.sidebarCollapsed.toString());
  }
  
  // Loading
  setLoading(loading) {
    this._state.loading = loading;
  }
  
  // Data methods
  setDashboardData(data) {
    this._state.dashboard = { ...this._state.dashboard, ...data };
  }
  
  setProducts(data) {
    this._state.products = { ...this._state.products, ...data };
  }
  
  setOrders(data) {
    this._state.orders = { ...this._state.orders, ...data };
  }
  
  setUsers(data) {
    this._state.users = { ...this._state.users, ...data };
  }
  
  setInventory(data) {
    this._state.inventory = { ...this._state.inventory, ...data };
  }
  
  setSettings(data) {
    this._state.settings = { ...this._state.settings, ...data };
  }
  
  // Inventory bulk mode
  toggleInventoryBulkMode() {
    this._state.inventory.bulkMode = !this._state.inventory.bulkMode;
    if (!this._state.inventory.bulkMode) {
      this._state.inventory.selectedIds.clear();
    }
  }
  
  toggleInventorySelection(id) {
    if (this._state.inventory.selectedIds.has(id)) {
      this._state.inventory.selectedIds.delete(id);
    } else {
      this._state.inventory.selectedIds.add(id);
    }
    // Trigger notification
    this._notify('inventory.selectedIds', new Set(this._state.inventory.selectedIds), this._state.inventory.selectedIds);
  }
  
  selectAllInventory(ids) {
    ids.forEach(id => this._state.inventory.selectedIds.add(id));
    this._notify('inventory.selectedIds', new Set(this._state.inventory.selectedIds), this._state.inventory.selectedIds);
  }
  
  clearInventorySelection() {
    this._state.inventory.selectedIds.clear();
    this._notify('inventory.selectedIds', new Set(), this._state.inventory.selectedIds);
  }
}

// Singleton instance
const store = new Store();

// Export for ES6 modules
export default store;

// Also attach to window for debugging
if (typeof window !== 'undefined') {
  window.__STORE__ = store;
}