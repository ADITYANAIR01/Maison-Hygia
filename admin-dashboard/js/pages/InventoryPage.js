/**
 * Maison Hygia Admin Dashboard - Inventory Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Table } from '../../components/Table.js';
import { Modal } from '../../components/Modal.js';
import { formatNumber, getStatusConfig } from '../../utils/formatters.js';
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
        this.inventory = data.data || data;
        this.totalItems = data.total || this.inventory.length;
        this.updateAlertBanner();
        this.renderTable();
        return;
      }
    } catch (err) {
      console.log('Using mock data - API not available');
    }
    
    this.inventory = this.getMockInventory();
    this.totalItems = this.inventory.length;
    this.updateAlertBanner();
    this.renderTable();
  }
  
  getMockInventory() {
    return [
      { id: 1, product_id: 1, product_name: 'Radiant Face Oil', variant_id: 1, variant_name: '30ml', sku: 'MHF-001-30', inventory_qty: 150, is_active: true },
      { id: 2, product_id: 2, product_name: 'Herbal Hair Mask', variant_id: 2, variant_name: '100g', sku: 'MHH-001-100', inventory_qty: 89, is_active: true },
      { id: 3, product_id: 2, product_name: 'Herbal Hair Mask', variant_id: 3, variant_name: '200g', sku: 'MHH-001-200', inventory_qty: 45, is_active: true },
      { id: 4, product_id: 3, product_name: 'Soothing Body Butter', variant_id: 4, variant_name: '200ml', sku: 'MHB-001-200', inventory_qty: 12, is_active: true },
      { id: 5, product_id: 4, product_name: 'Cleansing Face Wash', variant_id: 5, variant_name: '150ml', sku: 'MHF-002-150', inventory_qty: 200, is_active: true },
      { id: 6, product_id: 5, product_name: 'Ayurvedic Lip Balm', variant_id: 6, variant_name: '10g', sku: 'MHF-003-10', inventory_qty: 300, is_active: true },
      { id: 7, product_id: 6, product_name: 'Anti-Aging Serum', variant_id: 7, variant_name: '30ml', sku: 'MHF-004-30', inventory_qty: 67, is_active: true },
      { id: 8, product_id: 7, product_name: 'Detox Face Mask', variant_id: 8, variant_name: '75g', sku: 'MHF-005-75', inventory_qty: 8, is_active: true },
      { id: 9, product_id: 8, product_name: 'Hair Growth Oil', variant_id: 9, variant_name: '50ml', sku: 'MHH-002-50', inventory_qty: 134, is_active: true },
      { id: 10, product_id: 8, product_name: 'Hair Growth Oil', variant_id: 10, variant_name: '100ml', sku: 'MHH-002-100', inventory_qty: 56, is_active: true },
      { id: 11, product_id: 9, product_name: 'Body Scrub', variant_id: 11, variant_name: '250g', sku: 'MHB-002-250', inventory_qty: 78, is_active: true },
      { id: 12, product_id: 10, product_name: 'Eye Cream', variant_id: 12, variant_name: '15ml', sku: 'MHF-006-15', inventory_qty: 43, is_active: true },
      { id: 13, product_id: 11, product_name: 'Hand Cream', variant_id: 13, variant_name: '50ml', sku: 'MHB-003-50', inventory_qty: 156, is_active: true },
      { id: 14, product_id: 12, product_name: 'Foot Cream', variant_id: 14, variant_name: '75ml', sku: 'MHB-004-75', inventory_qty: 5, is_active: true },
      { id: 15, product_id: 13, product_name: 'Face Toner', variant_id: 15, variant_name: '200ml', sku: 'MHF-007-200', inventory_qty: 189, is_active: true },
      { id: 16, product_id: 14, product_name: 'Beard Oil', variant_id: 16, variant_name: '30ml', sku: 'MHH-003-30', inventory_qty: 92, is_active: true },
      { id: 17, product_id: 15, product_name: 'Massage Oil', variant_id: 17, variant_name: '100ml', sku: 'MHB-005-100', inventory_qty: 67, is_active: true },
      { id: 18, product_id: 1, product_name: 'Radiant Face Oil', variant_id: 18, variant_name: '50ml', sku: 'MHF-001-50', inventory_qty: 3, is_active: true },
      { id: 19, product_id: 4, product_name: 'Cleansing Face Wash', variant_id: 19, variant_name: '300ml', sku: 'MHF-002-300', inventory_qty: 0, is_active: true },
      { id: 20, product_id: 6, product_name: 'Anti-Aging Serum', variant_id: 20, variant_name: '15ml', sku: 'MHF-004-15', inventory_qty: 22, is_active: false },
      { id: 21, product_id: 9, product_name: 'Body Scrub', variant_id: 21, variant_name: '500g', sku: 'MHB-002-500', inventory_qty: 34, is_active: true },
      { id: 22, product_id: 11, product_name: 'Hand Cream', variant_id: 22, variant_name: '100ml', sku: 'MHB-003-100', inventory_qty: 7, is_active: true },
      { id: 23, product_id: 13, product_name: 'Face Toner', variant_id: 23, variant_name: '100ml', sku: 'MHF-007-100', inventory_qty: 12, is_active: true },
      { id: 24, product_id: 14, product_name: 'Beard Oil', variant_id: 24, variant_name: '50ml', sku: 'MHH-003-50', inventory_qty: 18, is_active: true },
      { id: 25, product_id: 15, product_name: 'Massage Oil', variant_id: 25, variant_name: '200ml', sku: 'MHB-005-200', inventory_qty: 45, is_active: true },
      { id: 26, product_id: 2, product_name: 'Herbal Hair Mask', variant_id: 26, variant_name: '50g', sku: 'MHH-001-50', inventory_qty: 9, is_active: true },
      { id: 27, product_id: 5, product_name: 'Ayurvedic Lip Balm', variant_id: 27, variant_name: '5g', sku: 'MHF-003-05', inventory_qty: 450, is_active: true },
      { id: 28, product_id: 10, product_name: 'Eye Cream', variant_id: 28, variant_name: '30ml', sku: 'MHF-006-30', inventory_qty: 28, is_active: true },
      { id: 29, product_id: 12, product_name: 'Foot Cream', variant_id: 29, variant_name: '150ml', sku: 'MHB-004-150', inventory_qty: 2, is_active: true },
      { id: 30, product_id: 3, product_name: 'Soothing Body Butter', variant_id: 30, variant_name: '400ml', sku: 'MHB-001-400', inventory_qty: 6, is_active: true }
    ];
  }
  
  updateAlertBanner() {
    const lowStockItems = this.inventory.filter(item => item.inventory_qty > 0 && item.inventory_qty < 10);
    const outOfStockItems = this.inventory.filter(item => item.inventory_qty === 0);
    
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
      { key: 'inventory_qty', label: 'Current Stock', sortable: true, render: (row) => {
        const isBulkMode = store.state.inventory.bulkMode;
        const stockClass = row.inventory_qty === 0 ? 'out' : row.inventory_qty < 10 ? 'low' : 'ok';
        
        if (isBulkMode) {
          return `<input type="number" class="form-input stock-input" data-id="${row.id}" value="${row.inventory_qty}" min="0" style="width: 80px;">`;
        }
        
        return `<span class="stock-cell ${stockClass}">${formatNumber(row.inventory_qty)}</span>`;
      }},
      { key: 'status', label: 'Stock Status', sortable: true, render: (row) => {
        if (row.inventory_qty === 0) return '<span class="badge badge-error">Out of Stock</span>';
        if (row.inventory_qty < 10) return '<span class="badge badge-warning">Low Stock</span>';
        return '<span class="badge badge-success">In Stock</span>';
      }},
      { key: 'is_active', label: 'Active', sortable: true, render: (row) => {
        const config = getStatusConfig(row.is_active ? 'active' : 'inactive');
        return `
          <label class="form-switch">
            <input type="checkbox" class="form-switch-input status-toggle" data-id="${row.id}" ${row.is_active ? 'checked' : ''}>
            <span class="form-switch-track"></span>
            <span class="form-switch-label">${config.label}</span>
          </label>
        `;
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
    
    // Bind status toggles
    this.tableContainer.querySelectorAll('.status-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id);
        this.toggleVariantStatus(id, e.target.checked);
      });
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
        id,
        inventory_qty: input ? parseInt(input.value) : 0
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
  
  async toggleVariantStatus(id, isActive) {
    const variant = this.inventory.find(v => v.id === id);
    if (!variant) return;
    
    try {
      await api.put(`/inventory/${id}`, { ...variant, is_active: isActive });
      variant.is_active = isActive;
      toast.success(`Variant ${isActive ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error('Failed to update variant status');
      this.renderTable();
    }
  }
  
  async updateVariantQty(id, qty) {
    const variant = this.inventory.find(v => v.id === id);
    if (!variant) return;
    
    variant.inventory_qty = qty;
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