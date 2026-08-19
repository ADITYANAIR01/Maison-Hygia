/**
 * Maison Hygia Admin Dashboard - Dashboard Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Chart } from '../../components/Chart.js';
import { formatCurrency, formatNumber, formatPercent, formatRelativeTime, getStatusConfig } from '../../utils/formatters.js';
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
    // Load mock data for now
    this.renderKPIs(this.getMockKPIs());
    this.renderRevenueChart(this.getMockRevenueData());
    this.renderRecentOrders(this.getMockRecentOrders());
    this.renderQuickActions();
    
    // Try to load real data if API is available
    this.loadRealData();
  }
  
  async loadRealData() {
    try {
      const [kpisResponse, revenueResponse, ordersResponse] = await Promise.allSettled([
        api.get('/dashboard/kpis'),
        api.get('/dashboard/revenue?days=30'),
        api.get('/orders?limit=5&sort=created_at&order=desc')
      ]);
      
      if (kpisResponse.status === 'fulfilled' && kpisResponse.value.ok) {
        const kpis = await kpisResponse.value.json();
        this.renderKPIs(kpis);
      }
      
      if (revenueResponse.status === 'fulfilled' && revenueResponse.value.ok) {
        const revenue = await revenueResponse.value.json();
        this.renderRevenueChart(revenue);
      }
      
      if (ordersResponse.status === 'fulfilled' && ordersResponse.value.ok) {
        const orders = await ordersResponse.value.json();
        this.renderRecentOrders(orders.data || orders);
      }
    } catch (err) {
      console.log('Using mock data - API not available:', err.message);
    }
  }
  
  getMockKPIs() {
    return {
      revenue: { value: 125430.50, trend: 12.5, trendLabel: 'vs last 30 days' },
      orders: { value: 1234, trend: 8.2, trendLabel: 'vs last 30 days' },
      users: { value: 5678, trend: 15.3, trendLabel: 'vs last 30 days' },
      conversion: { value: 3.24, trend: -2.1, trendLabel: 'vs last 30 days' }
    };
  }
  
  getMockRevenueData() {
    const labels = [];
    const values = [];
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      
      // Generate realistic revenue data
      const base = 3000 + Math.random() * 2000;
      const weekendBoost = (date.getDay() === 0 || date.getDay() === 6) ? 1.3 : 1;
      values.push(Math.round(base * weekendBoost * (0.8 + Math.random() * 0.4)));
    }
    
    return { labels, values };
  }
  
  getMockRecentOrders() {
    const statuses = ['paid', 'shipped', 'delivered', 'pending', 'cancelled'];
    const customers = ['Sarah Johnson', 'Michael Chen', 'Emily Davis', 'James Wilson', 'Lisa Anderson'];
    
    return Array.from({ length: 5 }, (_, i) => ({
      id: 1000 + i,
      customer: customers[i],
      email: customers[i].toLowerCase().replace(' ', '.') + '@example.com',
      total: (Math.random() * 200 + 50).toFixed(2),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      createdAt: new Date(Date.now() - i * 3600000 * Math.random() * 24).toISOString()
    }));
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
      { label: 'Add User', icon: 'user-plus', route: '#users' },
      { label: 'Site Settings', icon: 'settings', route: '#settings' },
      { label: 'Email Templates', icon: 'mail', route: '#settings?tab=email' }
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

// Import formatOrderId
import { formatOrderId } from '../../utils/formatters.js';

export default DashboardPage;