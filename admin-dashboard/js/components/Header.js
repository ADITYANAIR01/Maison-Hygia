/**
 * Maison Hygia Admin Dashboard - Header Component
 */

import store from '../../store.js';

export class Header {
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
        this.updateSidebarState(collapsed);
      })
    );
  }
  
  render() {
    this.container.innerHTML = `
      <header class="header" role="banner">
        <div class="header-left">
          <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar" aria-expanded="false" style="display:none;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          
          <div class="page-title-group">
            <h1 class="page-title" id="pageTitle">Dashboard</h1>
            <nav class="breadcrumbs" id="breadcrumbs" aria-label="Breadcrumb">
              <a href="#dashboard">Dashboard</a>
              <span class="breadcrumb-separator" aria-hidden="true">/</span>
              <span class="breadcrumb-current" aria-current="page">Home</span>
            </nav>
          </div>
        </div>
        
        <div class="header-right">
          <div class="header-action" id="searchAction" title="Search (Cmd+K)">
            <svg class="header-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          
          <div class="header-action notification-bell" id="notificationAction" title="Notifications">
            <svg class="header-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span class="notification-badge" id="notificationBadge" style="display:none;"></span>
          </div>
          
          <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
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
          </button>
        </div>
      </header>
    `;
    
    this.sidebarToggle = this.container.querySelector('#sidebarToggle');
    this.pageTitle = this.container.querySelector('#pageTitle');
    this.breadcrumbs = this.container.querySelector('#breadcrumbs');
    this.themeToggle = this.container.querySelector('#themeToggle');
    this.searchAction = this.container.querySelector('#searchAction');
    this.notificationAction = this.container.querySelector('#notificationAction');
    this.notificationBadge = this.container.querySelector('#notificationBadge');
    
    // Initialize state
    this.updateSidebarState(store.state.sidebarCollapsed);
    this.updateThemeIcon(store.state.theme);
  }
  
  bindEvents() {
    // Sidebar toggle (mobile)
    this.sidebarToggle.addEventListener('click', () => {
      store.state.sidebarOpen = !store.state.sidebarOpen;
    });
    
    // Theme toggle
    this.themeToggle.addEventListener('click', () => {
      store.toggleTheme();
    });
    
    // Search action (placeholder)
    this.searchAction.addEventListener('click', () => {
      // TODO: Implement global search
      console.log('Global search triggered');
    });
    
    // Notification action (placeholder)
    this.notificationAction.addEventListener('click', () => {
      // TODO: Implement notifications dropdown
      console.log('Notifications triggered');
    });
    
    // Keyboard shortcut for search (Cmd/Ctrl + K)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.searchAction.click();
      }
    });
  }
  
  updateSidebarState(collapsed) {
    // Header position is handled by CSS via sibling selector
    // This is here for any additional logic needed
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
  
  setPageTitle(title, breadcrumbs = []) {
    this.pageTitle.textContent = title;
    
    if (breadcrumbs.length > 0) {
      this.breadcrumbs.innerHTML = breadcrumbs.map((crumb, index) => {
        if (index === breadcrumbs.length - 1) {
          return `<span class="breadcrumb-current" aria-current="page">${this.escapeHtml(crumb)}</span>`;
        }
        return `<a href="${this.escapeHtml(crumb.url)}">${this.escapeHtml(crumb.label)}</a><span class="breadcrumb-separator" aria-hidden="true">/</span>`;
      }).join('');
      this.breadcrumbs.style.display = 'flex';
    } else {
      this.breadcrumbs.style.display = 'none';
    }
  }
  
  setNotificationCount(count) {
    if (count > 0) {
      this.notificationBadge.textContent = count > 99 ? '99+' : count;
      this.notificationBadge.style.display = 'flex';
    } else {
      this.notificationBadge.style.display = 'none';
    }
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  destroy() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}

export default Header;