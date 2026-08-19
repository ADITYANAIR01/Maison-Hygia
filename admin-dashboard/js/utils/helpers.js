/**
 * Maison Hygia Admin Dashboard - Helpers
 */

// Debounce function
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Throttle function
export function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Deep clone
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (obj instanceof Object) {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
}

// Generate unique ID
export function generateId(prefix = '') {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get nested object value
export function get(obj, path, defaultValue = undefined) {
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
}

// Set nested object value
export function set(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
  return obj;
}

// Pick object keys
export function pick(obj, keys) {
  return keys.reduce((result, key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
    return result;
  }, {});
}

// Omit object keys
export function omit(obj, keys) {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

// Group by
export function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = typeof key === 'function' ? key(item) : item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

// Sort by
export function sortBy(array, key, direction = 'asc') {
  return [...array].sort((a, b) => {
    const aVal = typeof key === 'function' ? key(a) : a[key];
    const bVal = typeof key === 'function' ? key(b) : b[key];
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// Unique by
export function uniqueBy(array, key) {
  const seen = new Set();
  return array.filter(item => {
    const val = typeof key === 'function' ? key(item) : item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

// Chunk array
export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Flatten array
export function flatten(array) {
  return array.reduce((flat, item) => {
    return flat.concat(Array.isArray(item) ? flatten(item) : item);
  }, []);
}

// Sleep/delay
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry with exponential backoff
export async function retry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);
  }
}

// Parse query string
export function parseQueryString(queryString) {
  const params = new URLSearchParams(queryString);
  const result = {};
  params.forEach((value, key) => {
    if (result[key]) {
      if (!Array.isArray(result[key])) {
        result[key] = [result[key]];
      }
      result[key].push(value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

// Build query string
export function buildQueryString(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => searchParams.append(key, v));
    } else if (value !== null && value !== undefined) {
      searchParams.append(key, value);
    }
  });
  return searchParams.toString();
}

// Copy to clipboard
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// Download file
export function downloadFile(data, filename, type = 'application/json') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Get element offset relative to viewport
export function getOffset(el) {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height
  };
}

// Check if element is in viewport
export function isInViewport(el, threshold = 0) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= -threshold &&
    rect.left >= -threshold &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + threshold &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + threshold
  );
}

// Smooth scroll to element
export function scrollToElement(el, offset = 0) {
  const elementPosition = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: elementPosition - offset,
    behavior: 'smooth'
  });
}

// Class names utility
export function classNames(...args) {
  return args
    .flat()
    .filter(Boolean)
    .join(' ');
}

// Style object to CSS string
export function styleToString(styles) {
  return Object.entries(styles)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
    .join('; ');
}

// Parse JSON safely
export function safeParse(json, defaultValue = null) {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

// Format error message
export function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    if (error.message) return error.message;
    if (error.error) return error.error;
    return JSON.stringify(error);
  }
  return 'An unknown error occurred';
}

// Local storage helpers
export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  
  clear() {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  }
};

// Session storage helpers
export const sessionStorage = {
  get(key, defaultValue = null) {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  
  set(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  
  remove(key) {
    try {
      window.sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
};

// Event emitter
export class EventEmitter {
  constructor() {
    this.events = new Map();
  }
  
  on(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(listener);
    return () => this.off(event, listener);
  }
  
  off(event, listener) {
    if (this.events.has(event)) {
      this.events.get(event).delete(listener);
    }
  }
  
  emit(event, ...args) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(listener => {
        try {
          listener(...args);
        } catch (err) {
          console.error(`Event listener error for ${event}:`, err);
        }
      });
    }
  }
  
  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }
}

export default {
  debounce,
  throttle,
  deepClone,
  generateId,
  get,
  set,
  pick,
  omit,
  groupBy,
  sortBy,
  uniqueBy,
  chunk,
  flatten,
  sleep,
  retry,
  parseQueryString,
  buildQueryString,
  copyToClipboard,
  downloadFile,
  getOffset,
  isInViewport,
  scrollToElement,
  classNames,
  styleToString,
  safeParse,
  formatError,
  storage,
  sessionStorage,
  EventEmitter
};