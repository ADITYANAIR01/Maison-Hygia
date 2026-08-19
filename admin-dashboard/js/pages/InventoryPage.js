/**
 * Maison Hygia Admin Dashboard - Inventory Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Table } from '../../components/Table.js';
import { formatNumber } from '../../utils/formatters.js';
import { debounce } from '../../utils/helpers.js';
import toast from '../../components/Toast.js';

export class InventoryPage {
  constructor(container) {
    this.container = container;
    this.table = null;
    this.inventory = [];
    this.filters = { search: '', lowStock: false };
    this.sortState = { column: 'product_name', direction: 'asc' };
    this.currentPage = 1;
    this.pageSize = 50;
    this.totalItems = 0;
    
    this.render();
    this.bindEvents();
    this.loadInventory();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="inventory-page">
        <!-- Alert Banner -->
        <div class="inventory-alert" id="inventoryAlert" style="display:none;">
          <svg class="inventory-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p class="inventory-alert-text">
            <span class="inventory-alert-count" id="lowStockCount">0</span> variant(s) low stock (< 10 units)
          </p>
        </div>
        
        <!-- Toolbar -->
        <div class="inventory-toolbar">
          <div class="inventory-search">
            <div class="search-input">
              <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="search" class="form-input search-input-field" id="inventorySearch" placeholder="Search inventory..." aria-label="Search inventory">
            </div>
          </div>
          
          <div class="inventory-filters">
            <label class="form-switch">
              <input type="checkbox" class="form-switch-input" id="lowStockFilter">
              <span class="form-switch-track"></span>
              <span class="form-switch-label">Low Stock Only</span>
            </label>
          </div>
          
          <div class="inventory-bulk-actions" id="bulkActions">
            <span class="inventory-bulk-count" id="bulkCount">0 selected</span>
            <button class="btn btn-primary btn-sm" id="saveBulkBtn">Save Changes</button>
            <button class="btn btn-ghost btn-sm" id="cancelBulkBtn">Cancel</button>
          </div>
        </div>
        
        <!-- Inventory Table -->
        <div class="card" id="inventoryTable"></div>
      </div>
    `;
    
    this.alertBanner = this.container.querySelector('#inventoryAlert');
    this.lowStockCount = this.container.querySelector('#lowStockCount');
    this.searchInput = this.container.querySelector('#inventorySearch');
    this.lowStockFilter = this.container.querySelector('#lowStockFilter');
    this.bulkActions = this.container.querySelector('#bulkActions');
    this.bulkCount = this.container.querySelector('#bulkCount');
    this.saveBulkBtn = this.container.querySelector('#saveBulkBtn');
    this.cancelBulkBtn = this.container.querySelector('#cancelBulkBtn');
    this.tableContainer = this.container.querySelector('#inventoryTable');
  }
  
  bindEvents() {
    this.searchInput.addEventListener('input', debounce((e) => {
      this.filters.search = e.target.value;
      this.currentPage = 1;
      this.loadInventory();
    }, 300));
    
    this.lowStockFilter.addEventListener('change', (e) => {
      this.filters.lowStock = e.target.checked;
      this.currentPage = 1;
      this.loadInventory();
    });
    
    this.saveBulkBtn.addEventListener('click', () => this.saveBulkChanges());
    this.cancelBulkBtn.addEventListener('click', () => this.cancelBulkMode());
  }
  
  async loadInventory() {
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
      if (this.filters.lowStock) params.low_stock = true;
      
      const response = await api.get('/inventory', params);
      
      if (response.ok) {
        const data = await response.json();
        this.inventory = data.data || [];
        this.totalItems = data.total || this.inventory.length;
        this.updateAlertBanner();
        this.renderTable();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      console.error('Failed to load inventory:', err.message);
      toast.error('Failed to load inventory');
    }
    
    this.inventory = [];
    this.totalItems = 0;
    this.updateAlertBanner();
    this.renderTable();
  }
  
  updateAlertBanner() {
    const lowStockItems = this.inventory.filter(item => item.inventory_quantity > 0 && item.inventory_quantity < 10);
    const outOfStockItems = this.inventory.filter(item => item.inventory_quantity === 0);
    
    if (lowStockItems.length > 0 || outOfStockItems.length > 0) {
      this.alertBanner.style.display = 'flex';
      this.lowStockCount.textContent = lowStockItems.length + outOfStockItems.length;
    } else {
      this.alertBanner.style.display = 'none';
    }
  }
  
  renderTable() {
    const columns = [
      { key: 'select', label: '', width: '50px', render: (row) => `
        <input type="checkbox" class="form-checkbox bulk-select" value="${row.id}" ${store.state.inventory.selectedIds.has(row.id) ? 'checked' : ''} aria-label="Select for bulk edit">
      ` },
      { key: 'product_name', label: 'Product', sortable: true, render: (row) => `
        <div class="product-cell">
          <div class="product-name">${this.escapeHtml(row.product_name)}</div>
          <div class="variant-name">${this.escapeHtml(row.variant_name)}</div>
        </div>
      ` },
      { key: 'sku', label: 'SKU', sortable: true, render: (row) => `<span class="sku">${this.escapeHtml(row.sku)}</span>` },
      { key: 'inventory_quantity', label: 'Current Stock', sortable: true, render: (row) => {
        const isBulkMode = store.state.inventory.bulkMode;
        const stockClass = row.inventory_quantity === 0 ? 'out' : row.inventory_quantity < 10 ? 'low' : 'ok';
        
        if (isBulkMode) {
          return `<input type="number" class="form-input stock-input" data-id="${row.id}" value="${row.inventory_quantity}" min="0" style="width: 80px;">`;
        }
        
        return `<span class="stock-cell ${stockClass}">${formatNumber(row.inventory_quantity)}</span>`;
      }},
      { key: 'status', label: 'Stock Status', sortable: true, render: (row) => {
        if (row.inventory_quantity === 0) return '<span class="badge badge-error">Out of Stock</span>';
        if (row.inventory_quantity < 10) return '<span class="badge badge-warning">Low Stock</span>';
        return '<span class="badge badge-success">In Stock</span>';
      }}
    ];
    
    this.table = new Table(this.tableContainer, {
      columns,
      data: this.inventory,
      sortable: true,
      pagination: true,
      pageSize: this.pageSize,
      selectable: true,
      onSort: (column, direction) => {
        this.sortState = { column, direction };
        this.loadInventory();
      },
      onPageChange: (page) => {
        this.currentPage = page;
        this.loadInventory();
      },
      onSelectionChange: (selectedIds) => {
        store.state.inventory.selectedIds = new Set(selectedIds);
        this.updateBulkActions();
      }
    });
    
    // Bind bulk checkboxes
    this.tableContainer.querySelectorAll('.bulk-select').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(e.target.value);
        if (e.target.checked) {
          store.state.inventory.selectedIds.add(id);
        } else {
          store.state.inventory.selectedIds.delete(id);
        }
        this.updateBulkActions();
      });
    });
    
    // Bind stock inputs in bulk mode
    if (store.state.inventory.bulkMode) {
      this.tableContainer.querySelectorAll('.stock-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const id = parseInt(e.target.dataset.id);
          const qty = parseInt(e.target.value);
          this.updateVariantQty(id, qty);
        });
      });
    }
  }
  
  updateBulkActions() {
    const count = store.state.inventory.selectedIds.size;
    this.bulkCount.textContent = `${count} selected`;
    
    if (count > 0) {
      this.bulkActions.classList.add('visible');
    } else {
      this.bulkActions.classList.remove('visible');
    }
  }
  
  cancelBulkMode() {
    store.state.inventory.bulkMode = false;
    store.state.inventory.selectedIds.clear();
    this.bulkActions.classList.remove('visible');
    this.renderTable();
  }
  
  async saveBulkChanges() {
    const selectedIds = Array.from(store.state.inventory.selectedIds);
    if (selectedIds.length === 0) return;
    
    const updates = selectedIds.map(id => {
      const input = this.tableContainer.querySelector(`.stock-input[data-id="${id}"]`);
      return {
        variant_id: id,
        quantity: input ? parseInt(input.value) : 0
      };
    });
    
    try {
      await api.put('/inventory/bulk', { updates });
      toast.success(`${updates.length} variant(s) updated`);
      this.cancelBulkMode();
      this.loadInventory();
    } catch (err) {
      toast.error('Failed to update inventory');
    }
  }
  
  async updateVariantQty(id, qty) {
    const variant = this.inventory.find(v => v.id === id);
    if (!variant) return;
    
    variant.inventory_quantity = qty;
    this.updateAlertBanner();
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

export default InventoryPage;