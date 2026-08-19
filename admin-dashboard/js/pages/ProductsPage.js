/**
 * Maison Hygia Admin Dashboard - Products Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Table } from '../../components/Table.js';
import { Modal } from '../../components/Modal.js';
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
        this.products = data.data || [];
        this.totalItems = data.total || this.products.length;
        this.renderTable();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      console.error('Failed to load products:', err.message);
      toast.error('Failed to load products');
    }
    
    this.products = [];
    this.totalItems = 0;
    this.renderTable();
  }
  
  renderTable() {
    const columns = [
      { key: 'image', label: 'Image', width: '60px', render: (row) => `
        <img src="${row.image_url || 'assets/logo.svg'}" 
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
        const totalStock = row.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0;
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
      await api.put(`/products/${id}`, { is_active: isActive });
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
      toast.success('Product deleted');
      this.loadProducts();
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
          <input type="number" class="form-input" name="variant_inventory_${variantId}" value="${variant.inventory_quantity ?? variant.inventory_qty ?? 0}" placeholder="0" min="0" required>
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
          inventory_quantity: inventoryQty || 0,
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
    
    // Handle image upload via presigned URL
    const imageInput = form.querySelector('#imageInput');
    if (imageInput.files[0]) {
      try {
        const file = imageInput.files[0];
        const upload = await api.postJson('/upload-url', {
          filename: file.name,
          folder: 'products',
          size: file.size
        });
        await api.uploadFile(upload.url, file);
        productData.image_url = upload.public_url;
      } catch (uploadErr) {
        toast.error('Failed to upload image');
        return;
      }
    } else if (product?.image_url) {
      productData.image_url = product.image_url;
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