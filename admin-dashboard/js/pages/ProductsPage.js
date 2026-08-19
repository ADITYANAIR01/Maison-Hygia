/**
 * Maison Hygia Admin Dashboard - Products Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Table } from '../../components/Table.js';
import { Modal } from '../../components/Modal.js';
import { Form } from '../../components/Form.js';
import { formatCurrency, formatNumber, getStatusConfig } from '../../utils/formatters.js';
import { validators, compose } from '../../utils/validators.js';
import { debounce, generateId } from '../../utils/helpers.js';
import toast from '../../components/Toast.js';

export class ProductsPage {
  constructor(container) {
    this.container = container;
    this.table = null;
    this.modal = null;
    this.products = [];
    this.filters = { search: '', status: 'all' };
    this.sortState = { column: 'created_at', direction: 'desc' };
    this.currentPage = 1;
    this.pageSize = 20;
    this.totalItems = 0;
    
    this.render();
    this.bindEvents();
    this.loadProducts();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="products-page">
        <!-- Toolbar -->
        <div class="products-toolbar">
          <div class="products-search">
            <div class="search-input">
              <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="search" class="form-input search-input-field" id="productSearch" placeholder="Search products..." aria-label="Search products">
            </div>
          </div>
          
          <div class="products-filters">
            <select class="form-input form-select products-filter-select" id="statusFilter" aria-label="Filter by status">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button class="btn btn-primary" id="createProductBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Product
            </button>
          </div>
        </div>
        
        <!-- Products Table -->
        <div class="card products-table-container" id="productsTable"></div>
      </div>
    `;
    
    this.searchInput = this.container.querySelector('#productSearch');
    this.statusFilter = this.container.querySelector('#statusFilter');
    this.createProductBtn = this.container.querySelector('#createProductBtn');
    this.tableContainer = this.container.querySelector('#productsTable');
  }
  
  bindEvents() {
    // Search with debounce
    this.searchInput.addEventListener('input', debounce((e) => {
      this.filters.search = e.target.value;
      this.currentPage = 1;
      this.loadProducts();
    }, 300));
    
    // Status filter
    this.statusFilter.addEventListener('change', (e) => {
      this.filters.status = e.target.value;
      this.currentPage = 1;
      this.loadProducts();
    });
    
    // Create product
    this.createProductBtn.addEventListener('click', () => this.openCreateModal());
  }
  
  async loadProducts() {
    // Show loading
    if (this.table) {
      this.table.setLoading(true);
    }
    
    try {
      // Try API first
      const params = {
        page: this.currentPage,
        limit: this.pageSize,
        sort: this.sortState.column,
        order: this.sortState.direction
      };
      
      if (this.filters.search) params.search = this.filters.search;
      if (this.filters.status !== 'all') params.is_active = this.filters.status === 'active';
      
      const response = await api.get('/products', params);
      
      if (response.ok) {
        const data = await response.json();
        this.products = data.data || data;
        this.totalItems = data.total || this.products.length;
        this.renderTable();
        return;
      }
    } catch (err) {
      console.log('Using mock data - API not available');
    }
    
    // Fallback to mock data
    this.products = this.getMockProducts();
    this.totalItems = this.products.length;
    this.renderTable();
  }
  
  getMockProducts() {
    return [
      { id: 1, name: 'Radiant Face Oil', sku: 'MHF-001', slug: 'radiant-face-oil', description: 'Luxurious ayurvedic face oil for glowing skin', price: 48.00, is_active: true, variants: [{ id: 1, name: '30ml', sku: 'MHF-001-30', price: 48.00, compare_at_price: 55.00, inventory_qty: 150, is_active: true }], image_key: null, created_at: '2024-01-15T10:00:00Z' },
      { id: 2, name: 'Herbal Hair Mask', sku: 'MHH-001', slug: 'herbal-hair-mask', description: 'Deep conditioning mask with bhringraj and amla', price: 36.00, is_active: true, variants: [{ id: 2, name: '100g', sku: 'MHH-001-100', price: 36.00, compare_at_price: 42.00, inventory_qty: 89, is_active: true }, { id: 3, name: '200g', sku: 'MHH-001-200', price: 58.00, compare_at_price: 68.00, inventory_qty: 45, is_active: true }], image_key: null, created_at: '2024-01-20T10:00:00Z' },
      { id: 3, name: 'Soothing Body Butter', sku: 'MHB-001', slug: 'soothing-body-butter', description: 'Rich body butter with shea and kokum', price: 42.00, is_active: false, variants: [{ id: 4, name: '200ml', sku: 'MHB-001-200', price: 42.00, compare_at_price: 48.00, inventory_qty: 12, is_active: true }], image_key: null, created_at: '2024-02-01T10:00:00Z' },
      { id: 4, name: 'Cleansing Face Wash', sku: 'MHF-002', slug: 'cleansing-face-wash', description: 'Gentle foaming cleanser with neem and tulsi', price: 28.00, is_active: true, variants: [{ id: 5, name: '150ml', sku: 'MHF-002-150', price: 28.00, compare_at_price: null, inventory_qty: 200, is_active: true }], image_key: null, created_at: '2024-02-10T10:00:00Z' },
      { id: 5, name: 'Ayurvedic Lip Balm', sku: 'MHF-003', slug: 'ayurvedic-lip-balm', description: 'Nourishing lip balm with ghee and rose', price: 18.00, is_active: true, variants: [{ id: 6, name: '10g', sku: 'MHF-003-10', price: 18.00, compare_at_price: 22.00, inventory_qty: 300, is_active: true }], image_key: null, created_at: '2024-02-15T10:00:00Z' },
      { id: 6, name: 'Anti-Aging Serum', sku: 'MHF-004', slug: 'anti-aging-serum', description: 'Potent serum with bakuchiol and gotu kola', price: 65.00, is_active: true, variants: [{ id: 7, name: '30ml', sku: 'MHF-004-30', price: 65.00, compare_at_price: 75.00, inventory_qty: 67, is_active: true }], image_key: null, created_at: '2024-03-01T10:00:00Z' },
      { id: 7, name: 'Detox Face Mask', sku: 'MHF-005', slug: 'detox-face-mask', description: 'Charcoal and clay mask for deep cleansing', price: 34.00, is_active: false, variants: [{ id: 8, name: '75g', sku: 'MHF-005-75', price: 34.00, compare_at_price: 39.00, inventory_qty: 8, is_active: true }], image_key: null, created_at: '2024-03-05T10:00:00Z' },
      { id: 8, name: 'Hair Growth Oil', sku: 'MHH-002', slug: 'hair-growth-oil', description: 'Stimulating oil with rosemary and brahmi', price: 32.00, is_active: true, variants: [{ id: 9, name: '50ml', sku: 'MHH-002-50', price: 32.00, compare_at_price: 38.00, inventory_qty: 134, is_active: true }, { id: 10, name: '100ml', sku: 'MHH-002-100', price: 55.00, compare_at_price: 65.00, inventory_qty: 56, is_active: true }], image_key: null, created_at: '2024-03-10T10:00:00Z' },
      { id: 9, name: 'Body Scrub', sku: 'MHB-002', slug: 'body-scrub', description: 'Exfoliating scrub with walnut and turmeric', price: 26.00, is_active: true, variants: [{ id: 11, name: '250g', sku: 'MHB-002-250', price: 26.00, compare_at_price: 32.00, inventory_qty: 78, is_active: true }], image_key: null, created_at: '2024-03-15T10:00:00Z' },
      { id: 10, name: 'Eye Cream', sku: 'MHF-006', slug: 'eye-cream', description: 'Brightening eye cream with saffron', price: 52.00, is_active: true, variants: [{ id: 12, name: '15ml', sku: 'MHF-006-15', price: 52.00, compare_at_price: 60.00, inventory_qty: 43, is_active: true }], image_key: null, created_at: '2024-03-20T10:00:00Z' },
      { id: 11, name: 'Hand Cream', sku: 'MHB-003', slug: 'hand-cream', description: 'Moisturizing hand cream with almond oil', price: 22.00, is_active: true, variants: [{ id: 13, name: '50ml', sku: 'MHB-003-50', price: 22.00, compare_at_price: null, inventory_qty: 156, is_active: true }], image_key: null, created_at: '2024-04-01T10:00:00Z' },
      { id: 12, name: 'Foot Cream', sku: 'MHB-004', slug: 'foot-cream', description: 'Healing foot cream with neem and mint', price: 24.00, is_active: false, variants: [{ id: 14, name: '75ml', sku: 'MHB-004-75', price: 24.00, compare_at_price: 28.00, inventory_qty: 5, is_active: true }], image_key: null, created_at: '2024-04-05T10:00:00Z' },
      { id: 13, name: 'Face Toner', sku: 'MHF-007', slug: 'face-toner', description: 'Balancing toner with rose water and witch hazel', price: 24.00, is_active: true, variants: [{ id: 15, name: '200ml', sku: 'MHF-007-200', price: 24.00, compare_at_price: 28.00, inventory_qty: 189, is_active: true }], image_key: null, created_at: '2024-04-10T10:00:00Z' },
      { id: 14, name: 'Beard Oil', sku: 'MHH-003', slug: 'beard-oil', description: 'Conditioning beard oil with jojoba and argan', price: 28.00, is_active: true, variants: [{ id: 16, name: '30ml', sku: 'MHH-003-30', price: 28.00, compare_at_price: 34.00, inventory_qty: 92, is_active: true }], image_key: null, created_at: '2024-04-15T10:00:00Z' },
      { id: 15, name: 'Massage Oil', sku: 'MHB-005', slug: 'massage-oil', description: 'Relaxing massage oil with lavender and sandalwood', price: 38.00, is_active: true, variants: [{ id: 17, name: '100ml', sku: 'MHB-005-100', price: 38.00, compare_at_price: 45.00, inventory_qty: 67, is_active: true }], image_key: null, created_at: '2024-04-20T10:00:00Z' }
    ];
  }
  
  renderTable() {
    const columns = [
      { key: 'image', label: 'Image', width: '60px', render: (row) => `
        <img src="${row.image_key ? `https://images.maisonhygia.adityanair.tech/${row.image_key}` : '/admin-dashboard/assets/logo.svg'}" 
             alt="${this.escapeHtml(row.name)}" class="image-thumb" style="object-fit: cover;">
      ` },
      { key: 'name', label: 'Name', sortable: true, render: (row) => `
        <div class="product-info">
          <div class="product-name">${this.escapeHtml(row.name)}</div>
          <div class="product-sku">${this.escapeHtml(row.sku)}</div>
        </div>
      ` },
      { key: 'sku', label: 'SKU', sortable: true },
      { key: 'price', label: 'Base Price', sortable: true, render: (row) => formatCurrency(row.price) },
      { key: 'variants', label: 'Variants', render: (row) => `<span class="variants-count">${row.variants?.length || 0} variant${(row.variants?.length || 0) !== 1 ? 's' : ''}</span>` },
      { key: 'stock', label: 'Stock', sortable: true, render: (row) => {
        const totalStock = row.variants?.reduce((sum, v) => sum + (v.inventory_qty || 0), 0) || 0;
        const stockClass = totalStock === 0 ? 'out' : totalStock < 10 ? 'low' : 'ok';
        return `<span class="stock ${stockClass}">${formatNumber(totalStock)}</span>`;
      }},
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
      { key: 'actions', label: 'Actions', width: '100px', render: (row) => `
        <div class="table-actions">
          <button class="table-action-btn edit-btn" data-id="${row.id}" aria-label="Edit product">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="table-action-btn delete delete-btn" data-id="${row.id}" aria-label="Delete product">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `}
    ];
    
    this.table = new Table(this.tableContainer, {
      columns,
      data: this.products,
      sortable: true,
      pagination: true,
      pageSize: this.pageSize,
      onSort: (column, direction) => {
        this.sortState = { column, direction };
        this.loadProducts();
      },
      onPageChange: (page) => {
        this.currentPage = page;
        this.loadProducts();
      },
      onRowClick: (row) => {
        this.openEditModal(row);
      }
    });
    
    // Bind status toggles
    this.tableContainer.querySelectorAll('.status-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id);
        this.toggleProductStatus(id, e.target.checked);
      });
    });
    
    // Bind edit/delete buttons
    this.tableContainer.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const product = this.products.find(p => p.id === id);
        if (product) this.openEditModal(product);
      });
    });
    
    this.tableContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        this.deleteProduct(id);
      });
    });
  }
  
  async toggleProductStatus(id, isActive) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;
    
    try {
      await api.put(`/products/${id}`, { ...product, is_active: isActive });
      product.is_active = isActive;
      toast.success(`Product ${isActive ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error('Failed to update product status');
      // Revert UI
      this.renderTable();
    }
  }
  
  async deleteProduct(id) {
    const confirmed = await Modal.confirm(
      'Delete Product',
      'Are you sure you want to delete this product? This action cannot be undone.',
      { danger: true, confirmText: 'Delete' }
    );
    
    if (!confirmed) return;
    
    try {
      await api.delete(`/products/${id}`);
      this.products = this.products.filter(p => p.id !== id);
      this.totalItems = this.products.length;
      this.renderTable();
      toast.success('Product deleted');
    } catch (err) {
      toast.error('Failed to delete product');
    }
  }
  
  openCreateModal() {
    this.openModal(null);
  }
  
  openEditModal(product) {
    this.openModal(product);
  }
  
  openModal(product) {
    const isEdit = !!product;
    
    this.modal = new Modal({
      title: isEdit ? 'Edit Product' : 'Create Product',
      size: 'xl',
      destroyOnClose: true
    });
    
    // Build form fields
    const fields = this.buildFormFields(product);
    
    this.modal.setContent(`
      <form id="productForm">
        <div class="form-section">
          <h4 class="form-section-title">Basic Information</h4>
          <div class="form-row">
            ${this.renderFormField(fields.name)}
            ${this.renderFormField(fields.sku)}
          </div>
          <div class="form-row">
            ${this.renderFormField(fields.slug)}
          </div>
          ${this.renderFormField(fields.description)}
          <div class="form-row">
            ${this.renderFormField(fields.price)}
            ${this.renderFormField(fields.is_active)}
          </div>
        </div>
        
        <div class="form-section variants-section">
          <div class="variants-header">
            <h4 class="form-section-title">Variants</h4>
            <button type="button" class="btn btn-secondary btn-sm add-variant-btn" id="addVariantBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Variant
            </button>
          </div>
          <div class="variants-list" id="variantsList">
            ${this.renderVariants(product?.variants || [])}
          </div>
        </div>
        
        <div class="form-section image-upload-section">
          <h4 class="form-section-title">Product Image</h4>
          <div class="image-upload-area" id="imageUploadArea" data-field="image">
            <input type="file" class="file-upload-input" accept="image/*" id="imageInput">
            <svg class="file-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p class="file-upload-text">Drag & drop or click to upload</p>
            <p class="file-upload-hint">Max 10MB • JPG, PNG, WebP</p>
            <div class="file-preview"></div>
          </div>
          <div class="image-preview" id="imagePreview" style="display:none;"></div>
        </div>
      </form>
    `);
    
    this.modal.setFooter(`
      <button class="btn btn-secondary" data-action="cancel">Cancel</button>
      <button class="btn btn-primary" data-action="submit" type="submit" form="productForm">${isEdit ? 'Save Changes' : 'Create Product'}</button>
    `);
    
    // Bind modal events
    this.bindModalEvents(product);
    this.modal.open();
  }
  
  buildFormFields(product) {
    const fields = {
      name: {
        type: 'text',
        name: 'name',
        label: 'Product Name',
        placeholder: 'Enter product name',
        required: true,
        value: product?.name || '',
        validate: compose(validators.required(), validators.minLength(2), validators.maxLength(100))
      },
      sku: {
        type: 'text',
        name: 'sku',
        label: 'SKU',
        placeholder: 'e.g., MHF-001',
        required: true,
        value: product?.sku || '',
        validate: compose(validators.required(), validators.sku(), validators.maxLength(50))
      },
      slug: {
        type: 'text',
        name: 'slug',
        label: 'Slug (URL)',
        placeholder: 'auto-generated from name',
        required: true,
        value: product?.slug || '',
        validate: compose(validators.required(), validators.slug(), validators.maxLength(100))
      },
      description: {
        type: 'textarea',
        name: 'description',
        label: 'Description',
        placeholder: 'Product description...',
        rows: 4,
        value: product?.description || '',
        validate: validators.maxLength(5000)
      },
      price: {
        type: 'number',
        name: 'price',
        label: 'Base Price ($)',
        placeholder: '0.00',
        required: true,
        value: product?.price || '',
        validate: compose(validators.required(), validators.price())
      },
      is_active: {
        type: 'switch',
        name: 'is_active',
        label: 'Active',
        value: product?.is_active !== false
      }
    };
    
    return fields;
  }
  
  renderFormField(field) {
    const { type = 'text', name, label, placeholder, required, value, validate, rows } = field;
    const inputId = `form-${name}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    
    let inputHtml = '';
    const commonAttrs = `
      id="${inputId}"
      name="${name}"
      ${placeholder ? `placeholder="${this.escapeHtml(placeholder)}"` : ''}
      ${required ? 'required' : ''}
      ${value !== undefined ? `value="${this.escapeHtml(value)}"` : ''}
    `;
    
    switch (type) {
      case 'textarea':
        inputHtml = `<textarea class="form-input form-textarea" rows="${rows || 4}" ${commonAttrs}>${this.escapeHtml(value || '')}</textarea>`;
        break;
      case 'switch':
        inputHtml = `
          <label class="form-switch">
            <input type="checkbox" class="form-switch-input" ${commonAttrs} ${value ? 'checked' : ''}>
            <span class="form-switch-track"></span>
            <span class="form-switch-label">${this.escapeHtml(label)}</span>
          </label>
        `;
        break;
      default:
        inputHtml = `<input type="${type}" class="form-input" ${commonAttrs}>`;
    }
    
    const labelHtml = type !== 'switch' && label ? 
      `<label class="form-label" for="${inputId}">${this.escapeHtml(label)}${required ? '<span class="form-required"></span>' : ''}</label>` : '';
    
    return `
      <div class="form-group">
        ${labelHtml}
        ${inputHtml}
        <div class="form-error" id="${errorId}" style="display:none;"></div>
      </div>
    `;
  }
  
  renderVariants(variants) {
    if (!variants || variants.length === 0) {
      return this.renderVariantRow({});
    }
    
    return variants.map((variant, index) => this.renderVariantRow(variant, index)).join('');
  }
  
  renderVariantRow(variant, index) {
    const variantId = variant.id || generateId('variant-');
    return `
      <div class="variant-row" data-variant-id="${variantId}">
        <div class="form-group">
          <label class="form-label">Variant Name</label>
          <input type="text" class="form-input" name="variant_name_${variantId}" value="${this.escapeHtml(variant.name || '')}" placeholder="e.g., 30ml" required>
        </div>
        <div class="form-group">
          <label class="form-label">SKU</label>
          <input type="text" class="form-input" name="variant_sku_${variantId}" value="${this.escapeHtml(variant.sku || '')}" placeholder="e.g., MHF-001-30" required>
        </div>
        <div class="form-group">
          <label class="form-label">Price ($)</label>
          <input type="number" class="form-input" name="variant_price_${variantId}" value="${variant.price || ''}" placeholder="0.00" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label class="form-label">Compare at ($)</label>
          <input type="number" class="form-input" name="variant_compare_${variantId}" value="${variant.compare_at_price || ''}" placeholder="0.00" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Inventory</label>
          <input type="number" class="form-input" name="variant_inventory_${variantId}" value="${variant.inventory_qty || 0}" placeholder="0" min="0" required>
        </div>
        <button type="button" class="variant-remove" data-variant-id="${variantId}" aria-label="Remove variant">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
  }
  
  bindModalEvents(product) {
    const isEdit = !!product;
    const form = this.modal.element.querySelector('#productForm');
    const variantsList = this.modal.element.querySelector('#variantsList');
    const addVariantBtn = this.modal.element.querySelector('#addVariantBtn');
    const imageUploadArea = this.modal.element.querySelector('#imageUploadArea');
    const imageInput = this.modal.element.querySelector('#imageInput');
    const imagePreview = this.modal.element.querySelector('#imagePreview');
    
    // Add variant
    addVariantBtn.addEventListener('click', () => {
      const variantHtml = this.renderVariantRow({});
      variantsList.insertAdjacentHTML('beforeend', variantHtml);
      this.bindVariantRemove(variantsList.lastElementChild);
    });
    
    // Remove variant
    variantsList.querySelectorAll('.variant-remove').forEach(btn => {
      this.bindVariantRemove(btn.closest('.variant-row'));
    });
    
    // Image upload
    this.bindImageUpload(imageUploadArea, imageInput, imagePreview);
    
    // Form submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit(product);
    });
    
    // Cancel
    this.modal.element.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      this.modal.close();
    });
    
    // Close on modal close
    this.modal.element.addEventListener('modal:close', () => {
      this.modal = null;
    });
  }
  
  bindVariantRemove(variantRow) {
    const removeBtn = variantRow.querySelector('.variant-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        variantRow.remove();
      });
    }
  }
  
  bindImageUpload(area, input, preview) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      area.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
      area.addEventListener(eventName, () => area.classList.add('drag-active'));
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      area.addEventListener(eventName, () => area.classList.remove('drag-active'));
    });
    
    area.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        input.files = files;
        this.handleImagePreview(files[0], preview, area);
      }
    });
    
    input.addEventListener('change', () => {
      if (input.files.length > 0) {
        this.handleImagePreview(input.files[0], preview, area);
      }
    });
    
    area.addEventListener('click', () => input.click());
  }
  
  handleImagePreview(file, preview, area) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `
        <img src="${e.target.result}" alt="${this.escapeHtml(file.name)}">
        <button type="button" class="image-preview-remove" aria-label="Remove image">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;
      preview.style.display = 'block';
      area.style.display = 'none';
      
      preview.querySelector('.image-preview-remove').addEventListener('click', () => {
        preview.innerHTML = '';
        preview.style.display = 'none';
        area.style.display = 'flex';
        input.value = '';
      });
    };
    reader.readAsDataURL(file);
  }
  
  async handleSubmit(product) {
    const form = this.modal.element.querySelector('#productForm');
    const formData = new FormData(form);
    const isEdit = !!product;
    
    // Collect variants
    const variants = [];
    this.modal.element.querySelectorAll('.variant-row').forEach(row => {
      const variantId = row.dataset.variantId;
      const name = row.querySelector('[name^="variant_name_"]').value;
      const sku = row.querySelector('[name^="variant_sku_"]').value;
      const price = parseFloat(row.querySelector('[name^="variant_price_"]').value);
      const compareAtPrice = row.querySelector('[name^="variant_compare_"]').value;
      const inventoryQty = parseInt(row.querySelector('[name^="variant_inventory_"]').value);
      
      if (name && sku && !isNaN(price)) {
        variants.push({
          id: variantId.startsWith('variant-') ? undefined : variantId,
          name,
          sku,
          price,
          compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) : null,
          inventory_qty: inventoryQty || 0,
          is_active: true
        });
      }
    });
    
    if (variants.length === 0) {
      toast.error('At least one variant is required');
      return;
    }
    
    // Build product data
    const productData = {
      name: formData.get('name'),
      sku: formData.get('sku'),
      slug: formData.get('slug'),
      description: formData.get('description'),
      price: parseFloat(formData.get('price')),
      is_active: formData.get('is_active') === 'on',
      variants
    };
    
    // Handle image upload (mock - would upload to presigned URL in production)
    const imageInput = form.querySelector('#imageInput');
    if (imageInput.files[0]) {
      // In production: upload to presigned URL
      productData.image_key = `products/${generateId()}-${imageInput.files[0].name}`;
    } else if (product?.image_key) {
      productData.image_key = product.image_key;
    }
    
    try {
      if (isEdit) {
        await api.put(`/products/${product.id}`, productData);
        toast.success('Product updated');
      } else {
        await api.post('/products', productData);
        toast.success('Product created');
      }
      
      this.modal.close();
      this.loadProducts();
    } catch (err) {
      toast.error(isEdit ? 'Failed to update product' : 'Failed to create product');
    }
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
  destroy() {
    if (this.table) this.table.destroy();
    if (this.modal) this.modal.destroy();
  }
}

export default ProductsPage;