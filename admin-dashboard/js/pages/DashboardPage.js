/**
 * Maison Hygia Admin Dashboard - Dashboard Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Chart } from '../../components/Chart.js';
import { Table } from '../../components/Table.js';
import { formatCurrency, formatNumber, formatPercent, formatRelativeTime, getStatusConfig, formatOrderId } from '../../utils/formatters.js';
import { debounce } from '../../utils/helpers.js';

export class DashboardPage {
  constructor(container) {
    this.container = container;
    this.chart = null;
    this.unsubscribers = [];
    this.render();
    this.bindEvents();
    this.loadData();
    this.subscribe();
  }
  
  subscribe() {
    this.unsubscribers.push(
      store.subscribe('theme', (theme) => {
        if (this.chart) {
          this.chart.setTheme(theme);
        }
      })
    );
  }
  
  render() {
    this.container.innerHTML = `
      <div class="dashboard-page">
        <!-- KPI Grid -->
        <div class="content-grid kpi-grid cols-4" id="kpiGrid">
          <!-- KPI cards rendered by JS -->
        </div>
        
        <!-- Charts & Tables -->
        <div class="content-grid cols-2">
          <!-- Revenue Chart -->
          <div class="card chart-card">
            <div class="card-header">
              <h3 class="card-title">Revenue (Last 30 Days)</h3>
            </div>
            <div class="card-body">
              <div class="chart-wrapper" id="revenueChart"></div>
            </div>
          </div>
          
          <!-- Recent Orders -->
          <div class="card recent-orders-card">
            <div class="card-header">
              <h3 class="card-title">Recent Orders</h3>
              <a href="#orders" class="btn btn-ghost btn-sm">View All</a>
            </div>
            <div class="card-body" style="padding: 0;">
              <div class="table-container" id="recentOrdersTable"></div>
            </div>
          </div>
        </div>
        
        <!-- Quick Actions -->
        <div class="card quick-actions-card">
          <div class="card-header">
            <h3 class="card-title">Quick Actions</h3>
          </div>
          <div class="card-body">
            <div class="quick-actions-grid" id="quickActions">
              <!-- Rendered by JS -->
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.kpiGrid = this.container.querySelector('#kpiGrid');
    this.revenueChartContainer = this.container.querySelector('#revenueChart');
    this.recentOrdersTable = this.container.querySelector('#recentOrdersTable');
    this.quickActionsContainer = this.container.querySelector('#quickActions');
  }
  
  bindEvents() {
    // Handle window resize for chart
    window.addEventListener('resize', debounce(() => {
      if (this.chart) {
        this.chart.chart?.resize();
      }
    }, 250));
  }
  
  async loadData() {
    try {
      const [kpisResponse, revenueResponse, ordersResponse] = await Promise.allSettled([
        api.get('/dashboard/kpis'),
        api.get('/dashboard/revenue?days=30'),
        api.get('/orders?limit=5')
      ]);
      
      if (kpisResponse.status === 'fulfilled' && kpisResponse.value.ok) {
        const kpis = await kpisResponse.value.json();
        this.renderKPIs(this.mapKPIs(kpis));
      } else {
        this.renderKPIs(this.getEmptyKPIs());
      }
      
      if (revenueResponse.status === 'fulfilled' && revenueResponse.value.ok) {
        const revenue = await revenueResponse.value.json();
        this.renderRevenueChart(this.mapRevenue(revenue));
      } else {
        this.renderRevenueChart({ labels: [], values: [] });
      }
      
      if (ordersResponse.status === 'fulfilled' && ordersResponse.value.ok) {
        const orders = await ordersResponse.value.json();
        this.renderRecentOrders((orders.data || []).map(order => this.mapOrder(order)));
      } else {
        this.renderRecentOrders([]);
      }
      
      this.renderQuickActions();
    } catch (err) {
      console.error('Failed to load dashboard data:', err.message);
      this.renderKPIs(this.getEmptyKPIs());
      this.renderRevenueChart({ labels: [], values: [] });
      this.renderRecentOrders([]);
      this.renderQuickActions();
    }
  }
  
  mapKPIs(kpis) {
    const orders = kpis.orders || 0;
    const paidOrders = kpis.paid_orders || 0;
    return {
      revenue: { value: kpis.revenue || 0, trend: 0, trendLabel: 'total paid revenue' },
      orders: { value: orders, trend: 0, trendLabel: 'total orders' },
      users: { value: kpis.customers || 0, trend: 0, trendLabel: 'unique customers' },
      conversion: { value: orders > 0 ? paidOrders / orders : 0, trend: 0, trendLabel: 'paid conversion rate' }
    };
  }
  
  getEmptyKPIs() {
    return {
      revenue: { value: 0, trend: 0, trendLabel: 'total paid revenue' },
      orders: { value: 0, trend: 0, trendLabel: 'total orders' },
      users: { value: 0, trend: 0, trendLabel: 'unique customers' },
      conversion: { value: 0, trend: 0, trendLabel: 'paid conversion rate' }
    };
  }
  
  mapRevenue(rows) {
    const labels = [];
    const values = [];
    (rows || []).forEach(row => {
      labels.push(new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      values.push(Math.round(row.revenue));
    });
    return { labels, values };
  }
  
  mapOrder(order) {
    return {
      id: order.id,
      customer: order.customer,
      email: order.email,
      total: order.total,
      status: order.status,
      createdAt: order.created_at
    };
  }
  
  renderKPIs(kpis) {
    const kpiConfigs = [
      { key: 'revenue', label: 'Revenue (30d)', icon: 'currency', color: 'success', format: formatCurrency },
      { key: 'orders', label: 'Orders (30d)', icon: 'shopping-bag', color: 'info', format: formatNumber },
      { key: 'users', label: 'Active Users', icon: 'users', color: 'primary', format: formatNumber },
      { key: 'conversion', label: 'Conversion Rate', icon: 'trending-up', color: 'warning', format: (v) => formatPercent(v / 100) }
    ];
    
    this.kpiGrid.innerHTML = kpiConfigs.map(config => {
      const kpi = kpis[config.key];
      const trendClass = kpi.trend >= 0 ? 'positive' : 'negative';
      const trendIcon = kpi.trend >= 0 ? '▲' : '▼';
      
      return `
        <div class="card stat-card">
          <div class="stat-header">
            <div class="stat-icon" style="background-color: var(--color-${config.color}-light); color: var(--color-${config.color});">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="${this._getIconSvg(config.icon)}"></svg>
            </div>
            <div class="stat-trend ${trendClass}">
              ${trendIcon} ${Math.abs(kpi.trend)}%
            </div>
          </div>
          <div class="stat-value">${config.format(kpi.value)}</div>
          <div class="stat-label">${kpi.trendLabel}</div>
        </div>
      `;
    }).join('');
  }
  
  _getIconSvg(icon) {
    const icons = {
      currency: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/>',
      'shopping-bag': '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
    };
    return icons[icon] || icons.currency;
  }
  
  renderRevenueChart(data) {
    this.chart = Chart.createRevenueChart(this.revenueChartContainer, data);
  }
  
  renderRecentOrders(orders) {
    const columns = [
      { key: 'id', label: 'Order', render: (row) => `<a href="#orders/${row.id}" class="view-link">${formatOrderId(row.id)}</a>` },
      { key: 'customer', label: 'Customer', render: (row) => `
        <div>
          <div style="font-weight: 500;">${this.escapeHtml(row.customer)}</div>
          <div style="font-size: var(--text-xs); color: var(--color-text-muted);">${this.escapeHtml(row.email)}</div>
        </div>
      ` },
      { key: 'total', label: 'Total', render: (row) => formatCurrency(row.total) },
      { key: 'status', label: 'Status', render: (row) => {
        const config = getStatusConfig(row.status);
        return `<span class="badge ${config.class}">${config.label}</span>`;
      }},
      { key: 'createdAt', label: 'Date', render: (row) => formatRelativeTime(row.createdAt) }
    ];
    
    new Table(this.recentOrdersTable, {
      columns,
      data: orders,
      sortable: false,
      pagination: false,
      pageSize: 5
    });
  }
  
  renderQuickActions() {
    const actions = [
      { label: 'Create Product', icon: 'plus', route: '#products', primary: true },
      { label: 'View Orders', icon: 'shopping-bag', route: '#orders' },
      { label: 'Manage Inventory', icon: 'package', route: '#inventory' },
      { label: 'Add User', icon: 'user-plus', route: '#users' }
    ];
    
    this.quickActionsContainer.innerHTML = actions.map(action => `
      <a href="${action.route}" class="quick-action ${action.primary ? 'primary' : ''}">
        <div class="quick-action-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="${this._getIconSvg(action.icon)}"></svg>
        </div>
        <span class="quick-action-label">${action.label}</span>
      </a>
    `).join('');
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
  destroy() {
    this.unsubscribers.forEach(unsub => unsub());
    if (this.chart) {
      this.chart.destroy();
    }
  }
}

export default DashboardPage;