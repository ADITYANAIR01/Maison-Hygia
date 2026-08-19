/**
 * Maison Hygia Admin Dashboard - Orders Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Table } from '../../components/Table.js';
import { Modal } from '../../components/Modal.js';
import { formatCurrency, formatDate, formatRelativeTime, getStatusConfig } from '../../utils/formatters.js';
import { debounce } from '../../utils/helpers.js';
import toast from '../../components/Toast.js';

export class OrdersPage {
  constructor(container) {
    this.container = container;
    this.table = null;
    this.orders = [];
    this.filters = { search: '', status: 'all', dateFrom: '', dateTo: '' };
    this.sortState = { column: 'created_at', direction: 'desc' };
    this.currentPage = 1;
    this.pageSize = 20;
    this.totalItems = 0;
    
    this.render();
    this.bindEvents();
    this.loadOrders();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="orders-page">
        <!-- Toolbar -->
        <div class="orders-toolbar">
          <div class="orders-search">
            <div class="search-input">
              <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="search" class="form-input search-input-field" id="orderSearch" placeholder="Search orders..." aria-label="Search orders">
            </div>
          </div>
          
          <div class="orders-filters">
            <select class="form-input form-select orders-filter-select" id="statusFilter" aria-label="Filter by status">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
            
            <div class="date-range-input">
              <input type="date" class="form-input" id="dateFrom" placeholder="From" aria-label="From date">
              <span class="date-separator">to</span>
              <input type="date" class="form-input" id="dateTo" placeholder="To" aria-label="To date">
            </div>
          </div>
        </div>
        
        <!-- Orders Table -->
        <div class="card" id="ordersTable"></div>
      </div>
    `;
    
    this.searchInput = this.container.querySelector('#orderSearch');
    this.statusFilter = this.container.querySelector('#statusFilter');
    this.dateFrom = this.container.querySelector('#dateFrom');
    this.dateTo = this.container.querySelector('#dateTo');
    this.tableContainer = this.container.querySelector('#ordersTable');
  }
  
  bindEvents() {
    this.searchInput.addEventListener('input', debounce((e) => {
      this.filters.search = e.target.value;
      this.currentPage = 1;
      this.loadOrders();
    }, 300));
    
    this.statusFilter.addEventListener('change', (e) => {
      this.filters.status = e.target.value;
      this.currentPage = 1;
      this.loadOrders();
    });
    
    this.dateFrom.addEventListener('change', (e) => {
      this.filters.dateFrom = e.target.value;
      this.currentPage = 1;
      this.loadOrders();
    });
    
    this.dateTo.addEventListener('change', (e) => {
      this.filters.dateTo = e.target.value;
      this.currentPage = 1;
      this.loadOrders();
    });
  }
  
  async loadOrders() {
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
      if (this.filters.status !== 'all') params.status = this.filters.status;
      if (this.filters.dateFrom) params.date_from = this.filters.dateFrom;
      if (this.filters.dateTo) params.date_to = this.filters.dateTo;
      
      const response = await api.get('/orders', params);
      
      if (response.ok) {
        const data = await response.json();
        this.orders = (data.data || []).map(order => this.normalizeOrder(order));
        this.totalItems = data.total || this.orders.length;
        this.renderTable();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      console.error('Failed to load orders:', err.message);
      toast.error('Failed to load orders');
    }
    
    this.orders = [];
    this.totalItems = 0;
    this.renderTable();
  }
  
  normalizeOrder(order) {
    const items = (order.items || []).map(item => ({
      name: item.name,
      variant: item.sku,
      qty: item.quantity,
      price: parseFloat(item.price),
      lineTotal: parseFloat(item.line_total)
    }));
    
    return {
      id: order.id,
      customer: order.customer,
      email: order.email,
      total: order.total,
      status: order.status,
      payment_status: order.payment_status,
      items,
      createdAt: order.created_at,
      timeline: this.buildTimeline(order)
    };
  }
  
  buildTimeline(order) {
    const timeline = [
      { label: 'Order Created', time: order.created_at, status: 'completed' }
    ];
    
    if (order.payment_status === 'paid') {
      timeline.push({
        label: 'Payment Received',
        time: order.updated_at || order.created_at,
        status: 'completed'
      });
    }
    
    if (order.status === 'fulfilled') {
      timeline.push({
        label: 'Order Fulfilled',
        time: order.updated_at || order.created_at,
        status: 'completed'
      });
    }
    
    if (order.status === 'cancelled') {
      timeline.push({
        label: 'Order Cancelled',
        time: order.updated_at || order.created_at,
        status: 'cancelled'
      });
    }
    
    if (order.status === 'refunded') {
      timeline.push({
        label: 'Refund Processed',
        time: order.updated_at || order.created_at,
        status: 'refunded'
      });
    }
    
    return timeline;
  }
  
  renderTable() {
    const columns = [
      { key: 'id', label: 'Order ID', sortable: true, render: (row) => `<span class="order-id">${this.formatOrderId(row.id)}</span>` },
      { key: 'customer', label: 'Customer', sortable: true, render: (row) => `
        <div class="customer-info">
          <div class="customer-name">${this.escapeHtml(row.customer)}</div>
          <div class="customer-email">${this.escapeHtml(row.email)}</div>
        </div>
      ` },
      { key: 'createdAt', label: 'Date', sortable: true, render: (row) => formatRelativeTime(row.createdAt) },
      { key: 'total', label: 'Total', sortable: true, render: (row) => `<span class="order-total">${formatCurrency(row.total)}</span>` },
      { key: 'status', label: 'Status', sortable: true, render: (row) => {
        const config = getStatusConfig(row.status);
        return `<select class="form-input form-select status-select" data-id="${row.id}" style="width: auto; padding: 2px 8px; font-size: var(--text-xs);">
          ${['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'].map(s => {
            const c = getStatusConfig(s);
            return `<option value="${s}" ${s === row.status ? 'selected' : ''}>${c.label}</option>`;
          }).join('')}
        </select>`;
      }},
      { key: 'actions', label: 'Actions', width: '100px', render: (row) => `
        <div class="table-actions">
          <button class="table-action-btn view-btn" data-id="${row.id}" aria-label="View order">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="table-action-btn delete refund-btn" data-id="${row.id}" aria-label="Refund order" ${['paid', 'fulfilled'].includes(row.status) ? '' : 'style="display:none;"'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>
      `}
    ];
    
    this.table = new Table(this.tableContainer, {
      columns,
      data: this.orders,
      sortable: true,
      pagination: true,
      pageSize: this.pageSize,
      onSort: (column, direction) => {
        this.sortState = { column, direction };
        this.loadOrders();
      },
      onPageChange: (page) => {
        this.currentPage = page;
        this.loadOrders();
      }
    });
    
    // Bind status selects
    this.tableContainer.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id);
        this.updateOrderStatus(id, e.target.value);
      });
    });
    
    // Bind view buttons
    this.tableContainer.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const order = this.orders.find(o => o.id === id);
        if (order) this.openOrderDetail(order);
      });
    });
    
    // Bind refund buttons
    this.tableContainer.querySelectorAll('.refund-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        this.refundOrder(id);
      });
    });
  }
  
  async updateOrderStatus(id, status) {
    const order = this.orders.find(o => o.id === id);
    if (!order) return;
    
    try {
      await api.put(`/orders/${id}`, { status });
      order.status = status;
      if (status === 'refunded') order.payment_status = 'refunded';
      order.timeline = this.buildTimeline(order);
      toast.success(`Order status updated to ${status}`);
      this.renderTable(); // Re-render to update refund button visibility
    } catch (err) {
      toast.error('Failed to update order status');
      this.renderTable();
    }
  }
  
  async refundOrder(id) {
    const confirmed = await Modal.confirm(
      'Process Refund',
      'Are you sure you want to refund this order? This will return the payment to the customer.',
      { danger: true, confirmText: 'Process Refund' }
    );
    
    if (!confirmed) return;
    
    try {
      await api.post(`/orders/${id}/refund`);
      const order = this.orders.find(o => o.id === id);
      if (order) {
        order.status = 'refunded';
        order.payment_status = 'refunded';
        order.timeline = this.buildTimeline(order);
        this.renderTable();
      }
      toast.success('Refund processed');
    } catch (err) {
      toast.error('Failed to process refund');
    }
  }
  
  openOrderDetail(order) {
    const modal = new Modal({
      title: `Order ${this.formatOrderId(order.id)}`,
      size: 'lg',
      destroyOnClose: true
    });
    
    modal.setContent(`
      <div class="order-detail">
        <!-- Order Header -->
        <div class="order-detail-header">
          <div>
            <h3 class="order-detail-title">${this.formatOrderId(order.id)}</h3>
            <div class="order-detail-meta">
              <div class="order-detail-meta-item">
                <span class="order-detail-meta-label">Customer:</span>
                <span class="order-detail-meta-value">${this.escapeHtml(order.customer)} (${this.escapeHtml(order.email)})</span>
              </div>
              <div class="order-detail-meta-item">
                <span class="order-detail-meta-label">Date:</span>
                <span class="order-detail-meta-value">${formatDate(order.createdAt)}</span>
              </div>
              <div class="order-detail-meta-item">
                <span class="order-detail-meta-label">Status:</span>
                <span class="order-detail-meta-value">
                  <select class="form-input form-select status-select" data-id="${order.id}" style="width: auto; display: inline-block; padding: 2px 8px; font-size: var(--text-sm);">
                    ${['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'].map(s => {
                      const c = getStatusConfig(s);
                      return `<option value="${s}" ${s === order.status ? 'selected' : ''}>${c.label}</option>`;
                    }).join('')}
                  </select>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Order Items -->
        <div class="card" style="margin-top: var(--space-6);">
          <div class="card-header">
            <h3 class="card-title">Items</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-container">
              <table class="table order-items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style="width: 100px;">Qty</th>
                    <th style="width: 120px;">Price</th>
                    <th style="width: 120px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map(item => `
                    <tr>
                      <td>
                        <div class="product-cell">
                          <span class="product-name">${this.escapeHtml(item.name)}</span>
                          <span class="variant-name">${this.escapeHtml(item.variant)}</span>
                        </div>
                      </td>
                      <td class="qty">${item.qty}</td>
                      <td class="price">${formatCurrency(item.price)}</td>
                      <td class="line-total">${formatCurrency(item.lineTotal)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <!-- Order Totals -->
        <div class="order-totals">
          <div class="order-total-row">
            <span>Subtotal</span>
            <span>${formatCurrency(order.total)}</span>
          </div>
          <div class="order-total-row grand-total">
            <span>Total</span>
            <span>${formatCurrency(order.total)}</span>
          </div>
        </div>
        
        <!-- Timeline -->
        <div class="order-timeline">
          <h3 class="section-title">Timeline</h3>
          <div class="timeline">
            ${order.timeline.map((event, index) => `
              <div class="timeline-item ${event.status} ${index === order.timeline.length - 1 && event.status !== 'cancelled' && event.status !== 'refunded' ? 'current' : ''}">
                <div class="timeline-time">${formatRelativeTime(event.time)}</div>
                <div class="timeline-label">${event.label}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `);
    
    modal.setFooter(`
      ${['paid', 'fulfilled'].includes(order.status) ? `
        <button class="btn btn-danger" data-action="refund">Process Refund</button>
      ` : ''}
      <button class="btn btn-secondary" data-action="close">Close</button>
    `);
    
    // Bind events
    modal.element.querySelector('[data-action="close"]').addEventListener('click', () => modal.close());
    
    const refundBtn = modal.element.querySelector('[data-action="refund"]');
    if (refundBtn) {
      refundBtn.addEventListener('click', () => {
        modal.close();
        this.refundOrder(order.id);
      });
    }
    
    // Status select in modal
    modal.element.querySelector('.status-select').addEventListener('change', (e) => {
      this.updateOrderStatus(order.id, e.target.value);
    });
    
    modal.open();
  }
  
  formatOrderId(id) {
    return `#${id.toString().padStart(8, '0')}`;
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

export default OrdersPage;