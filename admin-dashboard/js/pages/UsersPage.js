/**
 * Maison Hygia Admin Dashboard - Users Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Table } from '../../components/Table.js';
import { Modal } from '../../components/Modal.js';
import { formatCurrency, formatNumber, formatRelativeTime, getStatusConfig, formatRole } from '../../utils/formatters.js';
import { debounce } from '../../utils/helpers.js';
import toast from '../../components/Toast.js';

export class UsersPage {
  constructor(container) {
    this.container = container;
    this.table = null;
    this.users = [];
    this.filters = { search: '' };
    this.sortState = { column: 'created_at', direction: 'desc' };
    this.currentPage = 1;
    this.pageSize = 20;
    this.totalItems = 0;
    
    this.render();
    this.bindEvents();
    this.loadUsers();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="users-page">
        <!-- Toolbar -->
        <div class="users-toolbar">
          <div class="users-search">
            <div class="search-input">
              <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="search" class="form-input search-input-field" id="userSearch" placeholder="Search users..." aria-label="Search users">
            </div>
          </div>
        </div>
        
        <!-- Users Table -->
        <div class="card" id="usersTable"></div>
      </div>
    `;
    
    this.searchInput = this.container.querySelector('#userSearch');
    this.tableContainer = this.container.querySelector('#usersTable');
  }
  
  bindEvents() {
    this.searchInput.addEventListener('input', debounce((e) => {
      this.filters.search = e.target.value;
      this.currentPage = 1;
      this.loadUsers();
    }, 300));
  }
  
  async loadUsers() {
    if (this.table) {
      this.table.setLoading(true);
    }
    
    try {
      const params = {
        page: this.currentPage,
        limit: this.pageSize,
        sort: this.sortState.column,
        order: this.sortState.direction
      };
      
      if (this.filters.search) params.search = this.filters.search;
      
      const response = await api.get('/users', params);
      
      if (response.ok) {
        const data = await response.json();
        this.users = data.data || [];
        this.totalItems = data.total || this.users.length;
        this.renderTable();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      console.error('Failed to load users:', err.message);
      toast.error('Failed to load users');
    }
    
    this.users = [];
    this.totalItems = 0;
    this.renderTable();
  }
  
  renderTable() {
    const columns = [
      { key: 'avatar', label: '', width: '50px', render: (row) => `
        <div class="user-cell">
          <div class="avatar user-avatar">${this.getInitials(row.name)}</div>
        </div>
      ` },
      { key: 'name', label: 'Name', sortable: true, render: (row) => `
        <div class="user-cell">
          <div class="user-name">${this.escapeHtml(row.name)}</div>
          <div class="user-email">${this.escapeHtml(row.email)}</div>
        </div>
      ` },
      { key: 'role', label: 'Role', sortable: true, render: (row) => formatRole(row.role) },
      { key: 'stats', label: 'Activity', sortable: true, render: (row) => `
        <div class="stats-cell">
          <span class="stat-value">${formatNumber(row.orders_count)}</span>
          <span class="stat-label">orders</span>
        </div>
      ` },
      { key: 'total_spent', label: 'Total Spent', sortable: true, render: (row) => formatCurrency(row.total_spent) },
      { key: 'is_active', label: 'Status', sortable: true, render: (row) => {
        const config = getStatusConfig(row.is_active ? 'active' : 'inactive');
        return `
          <label class="form-switch">
            <input type="checkbox" class="form-switch-input status-toggle" data-id="${row.id}" ${row.is_active ? 'checked' : ''}>
            <span class="form-switch-track"></span>
            <span class="form-switch-label">${config.label}</span>
          </label>
        `;
      }},
      { key: 'actions', label: 'Actions', width: '120px', render: (row) => `
        <div class="table-actions">
          <button class="table-action-btn role-btn" data-id="${row.id}" aria-label="Change role">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </button>
        </div>
      `}
    ];
    
    this.table = new Table(this.tableContainer, {
      columns,
      data: this.users,
      sortable: true,
      pagination: true,
      pageSize: this.pageSize,
      onSort: (column, direction) => {
        this.sortState = { column, direction };
        this.loadUsers();
      },
      onPageChange: (page) => {
        this.currentPage = page;
        this.loadUsers();
      }
    });
    
    // Bind status toggles
    this.tableContainer.querySelectorAll('.status-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        this.toggleUserStatus(id, e.target.checked);
      });
    });
    
    // Bind role buttons
    this.tableContainer.querySelectorAll('.role-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const user = this.users.find(u => u.id === id);
        if (user) this.openRoleModal(user);
      });
    });
  }
  
  async toggleUserStatus(id, isActive) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;
    
    try {
      await api.put(`/users/${id}`, { enabled: isActive });
      user.is_active = isActive;
      toast.success(`User ${isActive ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error('Failed to update user status');
      this.renderTable();
    }
  }
  
  openRoleModal(user) {
    const modal = new Modal({
      title: 'Change Role',
      size: 'sm',
      destroyOnClose: true
    });
    
    modal.setContent(`
      <div class="form-group">
        <label class="form-label" for="roleSelect">Role</label>
        <select class="form-input form-select" id="roleSelect" required>
          <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer</option>
          <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <p style="font-size: var(--text-sm); color: var(--color-text-muted); margin-top: var(--space-4);">
        Changing to Admin grants full system access. Editor can manage content but not users.
      </p>
    `);
    
    modal.setFooter(`
      <button class="btn btn-secondary" data-action="cancel">Cancel</button>
      <button class="btn btn-primary" data-action="save">Save Changes</button>
    `);
    
    modal.element.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.close());
    modal.element.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const role = modal.element.querySelector('#roleSelect').value;
      await this.updateUserRole(user.id, role);
      modal.close();
    });
    
    modal.open();
  }
  
  async updateUserRole(id, role) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;
    
    try {
      await api.put(`/users/${id}/role`, { role });
      user.role = role;
      toast.success(`Role updated to ${role}`);
      this.renderTable();
    } catch (err) {
      toast.error('Failed to update role');
    }
  }
  
  getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
  destroy() {
    if (this.table) this.table.destroy();
  }
}

export default UsersPage;