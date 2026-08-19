/**
 * Maison Hygia Admin Dashboard - Sidebar Component
 */

import store from '../../store.js';

export class Sidebar {
  constructor(container) {
    this.container = container;
    this.unsubscribers = [];
    this.render();
    this.bindEvents();
    this.subscribe();
  }
  
  subscribe() {
    this.unsubscribers.push(
      store.subscribe('sidebarCollapsed', (collapsed) => {
        this.updateCollapsedState(collapsed);
      }),
      store.subscribe('sidebarOpen', (open) => {
        this.updateMobileState(open);
      }),
      store.subscribe('theme', () => {
        // Theme change handled by CSS
      }),
      store.subscribe('user', () => {
        this.updateUserInfo();
      })
    );
  }
  
  render() {
    this.container.innerHTML = `
      <aside class="sidebar" id="sidebar" role="navigation" aria-label="Main navigation">
        <div class="sidebar-header">
          <img src="/admin-dashboard/assets/logo.svg" alt="Maison Hygia" class="sidebar-logo" width="40" height="40">
          <div class="sidebar-brand">
            <span class="brand-name">Maison Hygia</span>
            <span class="brand-tagline">Ayurvedic Wellness</span>
          </div>
        </div>
        
        <nav class="sidebar-nav" aria-label="Admin navigation">
          <div class="nav-section">
            <h3 class="nav-section-title">Dashboard</h3>
            <ul class="nav-list" role="list">
              <li class="nav-item">
                <a href="#dashboard" class="nav-link" data-route="dashboard" aria-current="page">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  <span class="nav-label">Dashboard</span>
                </a>
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <h3 class="nav-section-title">Catalog</h3>
            <ul class="nav-list" role="list">
              <li class="nav-item">
                <a href="#products" class="nav-link" data-route="products">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6 12 2 4 6"/>
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <line x1="12" y1="2" x2="12" y2="22"/>
                  </svg>
                  <span class="nav-label">Products</span>
                </a>
              </li>
              <li class="nav-item">
                <a href="#inventory" class="nav-link" data-route="inventory">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                  <span class="nav-label">Inventory</span>
                </a>
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <h3 class="nav-section-title">Operations</h3>
            <ul class="nav-list" role="list">
              <li class="nav-item">
                <a href="#orders" class="nav-link" data-route="orders">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 0 1-8 0"/>
                  </svg>
                  <span class="nav-label">Orders</span>
                </a>
              </li>
              <li class="nav-item">
                <a href="#users" class="nav-link" data-route="users">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span class="nav-label">Users</span>
                </a>
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <h3 class="nav-section-title">Settings</h3>
            <ul class="nav-list" role="list">
              <li class="nav-item">
                <a href="#settings" class="nav-link" data-route="settings">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  <span class="nav-label">Settings</span>
                </a>
              </li>
            </ul>
          </div>
        </nav>
        
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar" id="userAvatar">MH</div>
            <div class="user-details">
              <div class="user-name" id="userName">Admin User</div>
              <div class="user-role" id="userRole">admin</div>
            </div>
          </div>
          
          <div class="sidebar-actions">
            <button class="sidebar-action-btn theme-toggle" id="themeToggle" aria-label="Toggle theme">
              <svg class="theme-icon sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <svg class="theme-icon moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              <span class="nav-label">Theme</span>
            </button>
            
            <button class="sidebar-action-btn danger" id="signOutBtn" aria-label="Sign out">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span class="nav-label">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
      
      <!-- Mobile sidebar toggle -->
      <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar" aria-expanded="false">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      
      <!-- Sidebar overlay for mobile -->
      <div class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true"></div>
    `;
    
    this.sidebar = this.container.querySelector('#sidebar');
    this.sidebarToggle = this.container.querySelector('#sidebarToggle');
    this.sidebarOverlay = this.container.querySelector('#sidebarOverlay');
    this.themeToggle = this.container.querySelector('#themeToggle');
    this.signOutBtn = this.container.querySelector('#signOutBtn');
    this.userAvatar = this.container.querySelector('#userAvatar');
    this.userName = this.container.querySelector('#userName');
    this.userRole = this.container.querySelector('#userRole');
    this.navLinks = this.container.querySelectorAll('.nav-link');
    
    // Initialize state
    this.updateCollapsedState(store.state.sidebarCollapsed);
    this.updateMobileState(store.state.sidebarOpen);
    this.updateThemeIcon(store.state.theme);
    this.updateUserInfo();
    this.setActiveRoute(window.location.hash.slice(1) || 'dashboard');
  }
  
  bindEvents() {
    // Sidebar toggle (mobile)
    this.sidebarToggle.addEventListener('click', () => {
      store.state.sidebarOpen = !store.state.sidebarOpen;
    });
    
    // Overlay click to close
    this.sidebarOverlay.addEventListener('click', () => {
      store.state.sidebarOpen = false;
    });
    
    // Theme toggle
    this.themeToggle.addEventListener('click', () => {
      store.toggleTheme();
    });
    
    // Sign out
    this.signOutBtn.addEventListener('click', () => {
      import('../../auth.js').then(({ default: auth }) => {
        auth.signOut();
      });
    });
    
    // Navigation links
    this.navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        // Close mobile sidebar on navigation
        if (window.innerWidth < 1024) {
          store.state.sidebarOpen = false;
        }
        
        // Update active state
        this.setActiveRoute(link.getAttribute('data-route'));
      });
    });
    
    // Keyboard navigation
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && store.state.sidebarOpen) {
        store.state.sidebarOpen = false;
      }
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024 && store.state.sidebarOpen) {
        store.state.sidebarOpen = false;
      }
    });
  }
  
  updateCollapsedState(collapsed) {
    if (collapsed) {
      this.sidebar.classList.add('collapsed');
    } else {
      this.sidebar.classList.remove('collapsed');
    }
  }
  
  updateMobileState(open) {
    if (open) {
      this.sidebar.classList.add('open');
      this.sidebarOverlay.classList.add('visible');
      this.sidebarToggle.setAttribute('aria-expanded', 'true');
    } else {
      this.sidebar.classList.remove('open');
      this.sidebarOverlay.classList.remove('visible');
      this.sidebarToggle.setAttribute('aria-expanded', 'false');
    }
  }
  
  updateThemeIcon(theme) {
    const sunIcon = this.themeToggle.querySelector('.sun-icon');
    const moonIcon = this.themeToggle.querySelector('.moon-icon');
    
    if (theme === 'dark') {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  }
  
  updateUserInfo() {
    const user = store.getUser();
    if (user) {
      this.userName.textContent = user.name || user.email;
      this.userRole.textContent = user.role || 'customer';
      this.userAvatar.textContent = (user.name || user.email || 'MH').charAt(0).toUpperCase();
    }
  }
  
  setActiveRoute(route) {
    this.navLinks.forEach(link => {
      const linkRoute = link.getAttribute('data-route');
      if (linkRoute === route) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }
  
  destroy() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}

export default Sidebar;