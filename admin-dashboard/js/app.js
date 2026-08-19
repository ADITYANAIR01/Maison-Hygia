/**
 * Maison Hygia Admin Dashboard - Main Application Entry Point
 */

import store from './store.js';
import auth from './auth.js';
import api from './api.js';
import router from './router.js';
import Sidebar from './components/Sidebar.js';
import Header from './components/Header.js';
import LoginPage from './pages/LoginPage.js';
import CallbackPage from './pages/CallbackPage.js';
import DashboardPage from './pages/DashboardPage.js';
import ProductsPage from './pages/ProductsPage.js';
import OrdersPage from './pages/OrdersPage.js';
import UsersPage from './pages/UsersPage.js';
import InventoryPage from './pages/InventoryPage.js';
import SettingsPage from './pages/SettingsPage.js';
import { Modal } from './components/Modal.js';
import toast from './components/Toast.js';

// Page instances
let currentPageInstance = null;
let sidebar = null;
let header = null;

// Initialize app
async function init() {
  // Load config from meta tags or environment
  const config = {
    clientId: document.querySelector('meta[name="cognito-client-id"]')?.content || 'your-client-id',
    redirectUri: `${window.location.origin}/admin#callback`
  };
  
  auth.init(config);
  
  // Initialize layout components
  initLayout();
  
  // Setup routes
  setupRoutes();
  
  // Handle initial route
  router._handleHashChange();
  
  // Global error handler
  window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    toast.error('An unexpected error occurred');
  });
  
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled rejection:', e.reason);
    toast.error('An unexpected error occurred');
  });
  
  console.log('Maison Hygia Admin Dashboard initialized');
}

function initLayout() {
  // Create sidebar container
  const sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'sidebar-container';
  document.body.appendChild(sidebarContainer);
  sidebar = new Sidebar(sidebarContainer);
  
  // Create header container
  const headerContainer = document.createElement('div');
  headerContainer.id = 'header-container';
  document.body.appendChild(headerContainer);
  header = new Header(headerContainer);
  
  // Create main content container
  const mainContent = document.createElement('main');
  mainContent.id = 'main-content';
  mainContent.className = 'main-content';
  mainContent.setAttribute('role', 'main');
  document.body.appendChild(mainContent);
}

function setupRoutes() {
  // Public routes (no auth required)
  router.addRoute('/login', (params) => renderPage('login', params));
  router.addRoute('/callback', (params) => renderPage('callback', params));
  
  // Protected routes (require auth)
  const protectedRoutes = [
    { path: '/dashboard', page: 'dashboard' },
    { path: '/products', page: 'products' },
    { path: '/orders', page: 'orders' },
    { path: '/users', page: 'users' },
    { path: '/inventory', page: 'inventory' },
    { path: '/settings', page: 'settings' }
  ];
  
  protectedRoutes.forEach(({ path, page }) => {
    router.addRoute(path, async (params) => {
      // Check auth
      if (!store.isAuthenticated()) {
        // Try to refresh token
        try {
          await auth.refreshToken();
        } catch {
          router.navigate('/login', true);
          return;
        }
      }
      
      // Check admin role for users page
      if (page === 'users' && !store.hasRole('admin')) {
        toast.error('Access denied. Admin role required.');
        router.navigate('/dashboard', true);
        return;
      }
      
      renderPage(page, params);
    });
  });
  
  // 404 route
  router.addRoute('/404', () => renderNotFound());
  
  // Default redirect
  router.beforeEach((route) => {
    const hash = window.location.hash.slice(1) || '/';
    if (hash === '/' || hash === '') {
      return '/dashboard';
    }
    return true;
  });
}

function renderPage(pageName, params) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;
  
  // Destroy previous page
  if (currentPageInstance && typeof currentPageInstance.destroy === 'function') {
    currentPageInstance.destroy();
  }
  
  // Show loading
  mainContent.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <div class="loading-text">Loading...</div>
    </div>
  `;
  
  // Update sidebar active state
  if (sidebar) {
    sidebar.setActiveRoute(pageName);
  }
  
  // Update header title
  if (header) {
    const titles = {
      dashboard: 'Dashboard',
      products: 'Products',
      orders: 'Orders',
      users: 'Users',
      inventory: 'Inventory',
      settings: 'Settings'
    };
    
    const breadcrumbs = getBreadcrumbs(pageName);
    header.setPageTitle(titles[pageName] || pageName, breadcrumbs);
  }
  
  // Close mobile sidebar
  store.state.sidebarOpen = false;
  
  // Create page instance
  switch (pageName) {
    case 'login':
      currentPageInstance = new LoginPage(mainContent);
      break;
    case 'callback':
      currentPageInstance = new CallbackPage(mainContent);
      break;
    case 'dashboard':
      currentPageInstance = new DashboardPage(mainContent);
      break;
    case 'products':
      currentPageInstance = new ProductsPage(mainContent);
      break;
    case 'orders':
      currentPageInstance = new OrdersPage(mainContent);
      break;
    case 'users':
      currentPageInstance = new UsersPage(mainContent);
      break;
    case 'inventory':
      currentPageInstance = new InventoryPage(mainContent);
      break;
    case 'settings':
      currentPageInstance = new SettingsPage(mainContent);
      break;
    default:
      renderNotFound();
      return;
  }
}

function getBreadcrumbs(pageName) {
  const breadcrumbMap = {
    dashboard: [],
    products: [{ label: 'Dashboard', url: '#dashboard' }],
    orders: [{ label: 'Dashboard', url: '#dashboard' }],
    users: [{ label: 'Dashboard', url: '#dashboard' }],
    inventory: [{ label: 'Dashboard', url: '#dashboard' }],
    settings: [{ label: 'Dashboard', url: '#dashboard' }]
  };
  
  return breadcrumbMap[pageName] || [];
}

function renderNotFound() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;
  
  if (currentPageInstance && typeof currentPageInstance.destroy === 'function') {
    currentPageInstance.destroy();
  }
  
  mainContent.innerHTML = `
    <div class="empty-state" style="padding: var(--space-16);">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h2 class="empty-state-title">Page Not Found</h2>
      <p class="empty-state-description">The page you're looking for doesn't exist or has been moved.</p>
      <a href="#dashboard" class="btn btn-primary" style="margin-top: var(--space-4);">Go to Dashboard</a>
    </div>
  `;
  
  if (header) {
    header.setPageTitle('404 - Not Found');
  }
  
  if (sidebar) {
    sidebar.setActiveRoute('404');
  }
}

// Handle auth state changes
store.subscribe('isAuthenticated', (isAuthenticated) => {
  if (isAuthenticated) {
    // User just logged in
    const hash = window.location.hash.slice(1) || '/';
    if (hash === 'login' || hash === 'callback' || hash === '') {
      router.navigate('/dashboard', true);
    }
  } else {
    // User logged out
    const hash = window.location.hash.slice(1) || '/';
    if (hash !== 'login' && hash !== 'callback') {
      router.navigate('/login', true);
    }
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
window.__APP__ = {
  store,
  auth,
  api,
  router,
  sidebar,
  header,
  toast
};