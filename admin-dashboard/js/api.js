/**
 * Maison Hygia Admin Dashboard - API Client
 * Axios-like fetch wrapper with interceptors
 */

import store from './store.js';
import auth from './auth.js';

class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.interceptors = {
      request: [],
      response: []
    };
    this._refreshing = false;
    this._refreshPromise = null;
  }
  
  // Interceptors
  addRequestInterceptor(fn) {
    this.interceptors.request.push(fn);
  }
  
  addResponseInterceptor(fn) {
    this.interceptors.response.push(fn);
  }
  
  // Core request method
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = store.getAccessToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Run request interceptors
    for (const fn of this.interceptors.request) {
      await fn(headers);
    }
    
    const config = {
      ...options,
      headers,
      credentials: 'include'
    };
    
    let response = await fetch(url, config);
    
    // Run response interceptors
    for (const fn of this.interceptors.response) {
      await fn(response);
    }
    
    // Handle 401 - token expired
    if (response.status === 401 && !endpoint.includes('/auth/')) {
      response = await this._handle401(endpoint, options);
    }
    
    return response;
  }
  
  async _handle401(endpoint, options) {
    // Prevent multiple simultaneous refresh attempts
    if (this._refreshing) {
      await this._refreshPromise;
      return this.request(endpoint, options);
    }
    
    this._refreshing = true;
    this._refreshPromise = auth.refreshToken().then(tokens => {
      this._refreshing = false;
      return tokens;
    }).catch(err => {
      this._refreshing = false;
      throw err;
    });
    
    try {
      await this._refreshPromise;
      // Retry original request with new token
      return this.request(endpoint, options);
    } catch (err) {
      // Refresh failed, redirect to login
      store.clearAuth();
      window.location.hash = '#login';
      throw err;
    }
  }
  
  // HTTP Methods
  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }
  
  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }
  
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
  
  // File upload with presigned URL
  async uploadFile(presignedUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded / e.total);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ status: xhr.status, data: xhr.responseText });
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });
      
      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
      
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }
  
  // Helper to parse JSON response
  async getJson(endpoint, params) {
    const response = await this.get(endpoint, params);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
  
  async postJson(endpoint, data) {
    const response = await this.post(endpoint, data);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  }
  
  async putJson(endpoint, data) {
    const response = await this.put(endpoint, data);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  }
  
  async deleteJson(endpoint) {
    const response = await this.delete(endpoint);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  }
}

// Create singleton with admin API base URL (overridable via meta tag)
const defaultBaseUrl = 'https://api.maisonhygia.adityanair.tech/api/v1/admin';
const api = new ApiClient(
  document.querySelector('meta[name="api-base-url"]')?.content || defaultBaseUrl
);

// Add default request interceptor for logging
api.addRequestInterceptor((headers) => {
  console.debug('[API Request]', headers);
});

// Add response interceptor for error handling
api.addResponseInterceptor(async (response) => {
  if (!response.ok && response.status !== 401) {
    console.error('[API Error]', response.status, response.statusText);
  }
});

export default api;