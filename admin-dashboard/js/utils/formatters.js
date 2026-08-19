/**
 * Maison Hygia Admin Dashboard - Formatters
 */

// Currency formatting
export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatCurrencyCompact(amount, currency = 'USD', locale = 'en-US') {
  if (amount === null || amount === undefined) return '-';
  
  if (amount >= 1000000000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(amount);
  }
  
  if (amount >= 1000000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(amount);
  }
  
  if (amount >= 1000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 0
    }).format(amount);
  }
  
  return formatCurrency(amount, currency, locale);
}

// Number formatting
export function formatNumber(num, locale = 'en-US') {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat(locale).format(num);
}

export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
}

// Date formatting
export function formatDate(date, options = {}) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  };
  
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(d);
}

export function formatDateTime(date, options = {}) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(d);
}

export function formatRelativeTime(date) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  const now = new Date();
  const diffMs = now - d;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// Status formatting
export function formatStatus(status) {
  const statusMap = {
    pending: { label: 'Pending', class: 'badge-warning' },
    paid: { label: 'Paid', class: 'badge-success' },
    fulfilled: { label: 'Fulfilled', class: 'badge-info' },
    cancelled: { label: 'Cancelled', class: 'badge-error' },
    refunded: { label: 'Refunded', class: 'badge-neutral' },
    active: { label: 'Active', class: 'badge-success' },
    inactive: { label: 'Inactive', class: 'badge-neutral' },
    draft: { label: 'Draft', class: 'badge-neutral' },
    published: { label: 'Published', class: 'badge-success' },
    archived: { label: 'Archived', class: 'badge-neutral' }
  };
  
  const config = statusMap[status] || { label: status, class: 'badge-neutral' };
  return `<span class="badge ${config.class}">${config.label}</span>`;
}

export function getStatusConfig(status) {
  const statusMap = {
    pending: { label: 'Pending', class: 'badge-warning', color: 'warning' },
    paid: { label: 'Paid', class: 'badge-success', color: 'success' },
    fulfilled: { label: 'Fulfilled', class: 'badge-info', color: 'info' },
    cancelled: { label: 'Cancelled', class: 'badge-error', color: 'error' },
    refunded: { label: 'Refunded', class: 'badge-neutral', color: 'muted' },
    active: { label: 'Active', class: 'badge-success', color: 'success' },
    inactive: { label: 'Inactive', class: 'badge-neutral', color: 'muted' },
    draft: { label: 'Draft', class: 'badge-neutral', color: 'muted' },
    published: { label: 'Published', class: 'badge-success', color: 'success' },
    archived: { label: 'Archived', class: 'badge-neutral', color: 'muted' }
  };
  
  return statusMap[status] || { label: status, class: 'badge-neutral', color: 'muted' };
}

// Role formatting
export function formatRole(role) {
  const roleMap = {
    admin: { label: 'Admin', class: 'role-badge admin' },
    editor: { label: 'Editor', class: 'role-badge editor' },
    customer: { label: 'Customer', class: 'role-badge customer' }
  };
  
  const config = roleMap[role] || { label: role, class: 'role-badge' };
  return `<span class="${config.class}">${config.label}</span>`;
}

// File size formatting
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes) return '-';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Truncate text
export function truncate(text, length = 50) {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.slice(0, length).trim() + '…';
}

// Generate initials
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Format SKU
export function formatSKU(sku) {
  if (!sku) return '-';
  return sku.toUpperCase();
}

// Format phone
export function formatPhone(phone) {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

// Format order ID
export function formatOrderId(id) {
  if (!id) return '-';
  return `#${id.toString().padStart(8, '0')}`;
}