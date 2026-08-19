/**
 * Maison Hygia Admin Dashboard - Chart Component
 * Wrapper around Chart.js
 */

export class Chart {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {},
      ...options
    };
    
    this.chart = null;
    this.resizeObserver = null;
    
    this.init();
  }
  
  async init() {
    // Wait for Chart.js to load
    if (typeof Chart === 'undefined' && typeof ChartJs === 'undefined') {
      await this._loadChartJs();
    }
    
    const ChartLib = window.Chart || window.ChartJs;
    if (!ChartLib) {
      console.error('Chart.js failed to load');
      this.container.innerHTML = '<div class="empty-state"><p>Chart library not loaded</p></div>';
      return;
    }
    
    this._createChart(ChartLib);
    this._setupResizeObserver();
  }
  
  _loadChartJs() {
    return new Promise((resolve, reject) => {
      if (window.Chart) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Chart.js'));
      document.head.appendChild(script);
    });
  }
  
  _createChart(ChartLib) {
    // Default options with theme support
    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-dark').trim() || '#1A1A1A',
          titleColor: getComputedStyle(document.documentElement).getPropertyValue('--color-white').trim() || '#FFFFFF',
          bodyColor: getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#6B6B6B',
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#E5E5E5',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) {
                label += new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(context.parsed.y);
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim() || '#9CA3AF',
            font: {
              family: getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'Inter'
            }
          }
        },
        y: {
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#E5E5E5',
            drawBorder: false
          },
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim() || '#9CA3AF',
            font: {
              family: getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'Inter'
            },
            callback: (value) => {
              if (value >= 1000000) {
                return '$' + (value / 1000000).toFixed(1) + 'M';
              }
              if (value >= 1000) {
                return '$' + (value / 1000).toFixed(0) + 'K';
              }
              return '$' + value;
            }
          }
        }
      }
    };
    
    // Merge options
    const mergedOptions = this._deepMerge(defaultOptions, this.options.options);
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.container.innerHTML = '';
    this.container.appendChild(canvas);
    
    // Get colors from CSS variables
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-gold').trim() || '#C8A951';
    const primaryLight = getComputedStyle(document.documentElement).getPropertyValue('--color-gold-light').trim() || '#E8D8A8';
    
    // Update dataset colors if not specified
    const datasets = this.options.data.datasets.map(ds => ({
      ...ds,
      borderColor: ds.borderColor || primaryColor,
      backgroundColor: ds.backgroundColor || this._hexToRgba(primaryColor, 0.1),
      pointBackgroundColor: ds.pointBackgroundColor || primaryColor,
      pointBorderColor: ds.pointBorderColor || '#FFFFFF',
      pointHoverBackgroundColor: ds.pointHoverBackgroundColor || '#FFFFFF',
      pointHoverBorderColor: ds.pointHoverBorderColor || primaryColor,
      tension: ds.tension ?? 0.4,
      fill: ds.fill ?? true
    }));
    
    this.chart = new ChartLib(canvas, {
      type: this.options.type,
      data: {
        ...this.options.data,
        datasets
      },
      options: mergedOptions
    });
  }
  
  _deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
  
  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  _setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.chart) {
        this.chart.resize();
      }
    });
    this.resizeObserver.observe(this.container);
  }
  
  // Public methods
  updateData(data) {
    if (this.chart) {
      this.chart.data = data;
      this.chart.update();
    }
  }
  
  updateOptions(options) {
    if (this.chart) {
      this.chart.options = this._deepMerge(this.chart.options, options);
      this.chart.update();
    }
  }
  
  setTheme(theme) {
    if (!this.chart) return;
    
    const isDark = theme === 'dark';
    const textColor = isDark ? '#9CA3AF' : '#9CA3AF';
    const gridColor = isDark ? '#374151' : '#E5E5E5';
    const bgColor = isDark ? '#1A1A1A' : '#FFFFFF';
    const tooltipBg = isDark ? '#1A1A1A' : '#FFFFFF';
    const tooltipTitle = isDark ? '#F5F0E8' : '#1A1A1A';
    const tooltipBody = isDark ? '#9CA3AF' : '#6B6B6B';
    const tooltipBorder = isDark ? '#374151' : '#E5E5E5';
    
    this.chart.options.scales.x.ticks.color = textColor;
    this.chart.options.scales.y.ticks.color = textColor;
    this.chart.options.scales.y.grid.color = gridColor;
    this.chart.options.plugins.tooltip.backgroundColor = tooltipBg;
    this.chart.options.plugins.tooltip.titleColor = tooltipTitle;
    this.chart.options.plugins.tooltip.bodyColor = tooltipBody;
    this.chart.options.plugins.tooltip.borderColor = tooltipBorder;
    
    this.chart.update();
  }
  
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
  
  // Static factory methods
  static createRevenueChart(container, data) {
    return new Chart(container, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Revenue',
          data: data.values,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 6
        }]
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => {
                return `Revenue: ${new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(context.parsed.y)}`;
              }
            }
          }
        }
      }
    });
  }
  
  static createBarChart(container, data, options = {}) {
    return new Chart(container, {
      type: 'bar',
      data,
      options: {
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        },
        ...options
      }
    });
  }
  
  static createDoughnutChart(container, data, options = {}) {
    return new Chart(container, {
      type: 'doughnut',
      data,
      options: {
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 16
            }
          }
        },
        ...options
      }
    });
  }
}

export default Chart;