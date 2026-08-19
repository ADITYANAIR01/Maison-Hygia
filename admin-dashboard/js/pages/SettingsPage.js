/**
 * Maison Hygia Admin Dashboard - Settings Page
 */

import store from '../../store.js';
import api from '../../api.js';
import { Modal } from '../../components/Modal.js';
import { Form } from '../../components/Form.js';
import { debounce, generateId } from '../../utils/helpers.js';
import toast from '../../components/Toast.js';

export class SettingsPage {
  constructor(container) {
    this.container = container;
    this.activeTab = 'site-config';
    this.siteConfig = null;
    this.emailTemplates = [];
    this.render();
    this.bindEvents();
    this.loadData();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="settings-page">
        <!-- Tabs -->
        <nav class="settings-tabs" role="tablist" aria-label="Settings sections">
          <button class="settings-tab active" role="tab" data-tab="site-config" aria-selected="true" aria-controls="site-config-panel">
            Site Configuration
          </button>
          <button class="settings-tab" role="tab" data-tab="email-templates" aria-selected="false" aria-controls="email-templates-panel">
            Email Templates
          </button>
        </nav>
        
        <!-- Site Config Panel -->
        <div class="settings-panel active" id="site-config-panel" role="tabpanel" aria-labelledby="site-config-tab">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Site Configuration</h3>
            </div>
            <div class="card-body">
              <div class="json-editor">
                <div class="json-editor-toolbar">
                  <span class="json-editor-title">JSON Configuration</span>
                  <div class="json-editor-actions">
                    <button class="btn btn-secondary btn-sm" id="formatJsonBtn">Format</button>
                    <button class="btn btn-primary btn-sm" id="saveConfigBtn">Save Changes</button>
                  </div>
                </div>
                <textarea class="json-editor-textarea" id="siteConfigEditor" spellcheck="false" placeholder="Loading..."></textarea>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Email Templates Panel -->
        <div class="settings-panel" id="email-templates-panel" role="tabpanel" aria-labelledby="email-templates-tab" hidden>
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Email Templates</h3>
              <button class="btn btn-primary btn-sm" id="createTemplateBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create Template
              </button>
            </div>
            <div class="card-body">
              <div class="email-templates-list" id="emailTemplatesList">
                <!-- Templates rendered by JS -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.tabs = this.container.querySelectorAll('.settings-tab');
    this.panels = this.container.querySelectorAll('.settings-panel');
    this.siteConfigEditor = this.container.querySelector('#siteConfigEditor');
    this.formatJsonBtn = this.container.querySelector('#formatJsonBtn');
    this.saveConfigBtn = this.container.querySelector('#saveConfigBtn');
    this.emailTemplatesList = this.container.querySelector('#emailTemplatesList');
    this.createTemplateBtn = this.container.querySelector('#createTemplateBtn');
  }
  
  bindEvents() {
    // Tab switching
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });
    
    // Format JSON
    this.formatJsonBtn.addEventListener('click', () => this.formatJson());
    
    // Save config
    this.saveConfigBtn.addEventListener('click', () => this.saveSiteConfig());
    
    // Auto-format on blur
    let formatTimeout;
    this.siteConfigEditor.addEventListener('input', () => {
      clearTimeout(formatTimeout);
      formatTimeout = setTimeout(() => {
        try {
          const parsed = JSON.parse(this.siteConfigEditor.value);
          this.siteConfigEditor.value = JSON.stringify(parsed, null, 2);
        } catch {
          // Ignore invalid JSON while typing
        }
      }, 500);
    });
    
    // Create template
    this.createTemplateBtn.addEventListener('click', () => this.openTemplateModal(null));
  }
  
  switchTab(tabId) {
    this.activeTab = tabId;
    
    this.tabs.forEach(tab => {
      const isActive = tab.dataset.tab === tabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });
    
    this.panels.forEach(panel => {
      const isActive = panel.id === `${tabId}-panel`;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
    
    // Load email templates when switching to that tab
    if (tabId === 'email-templates' && this.emailTemplates.length === 0) {
      this.loadEmailTemplates();
    }
  }
  
  async loadData() {
    await Promise.all([
      this.loadSiteConfig(),
      this.loadEmailTemplates()
    ]);
  }
  
  async loadSiteConfig() {
    try {
      const response = await api.get('/settings/site-config');
      if (response.ok) {
        this.siteConfig = await response.json();
      } else {
        this.siteConfig = this.getDefaultSiteConfig();
      }
    } catch {
      this.siteConfig = this.getDefaultSiteConfig();
    }
    
    this.siteConfigEditor.value = JSON.stringify(this.siteConfig, null, 2);
  }
  
  getDefaultSiteConfig() {
    return {
      site_name: "Maison Hygia",
      site_description: "Ayurvedic Skincare, Haircare & Bodycare",
      currency: "USD",
      timezone: "America/Los_Angeles",
      maintenance_mode: false,
      seo: {
        meta_title: "Maison Hygia - Ayurvedic Wellness",
        meta_description: "Discover premium Ayurvedic skincare, haircare, and bodycare products crafted with natural ingredients.",
        og_image: "/assets/og-image.jpg"
      },
      features: {
        reviews_enabled: true,
        wishlist_enabled: true,
        compare_enabled: false,
        guest_checkout: true
      },
      shipping: {
        free_shipping_threshold: 75,
        default_carrier: "USPS",
        international_enabled: true
      },
      payments: {
        stripe_enabled: true,
        paypal_enabled: true,
        apple_pay_enabled: true,
        google_pay_enabled: true
      }
    };
  }
  
  formatJson() {
    try {
      const parsed = JSON.parse(this.siteConfigEditor.value);
      this.siteConfigEditor.value = JSON.stringify(parsed, null, 2);
      toast.success('JSON formatted');
    } catch (err) {
      toast.error('Invalid JSON: ' + err.message);
    }
  }
  
  async saveSiteConfig() {
    try {
      const config = JSON.parse(this.siteConfigEditor.value);
      await api.put('/settings/site-config', config);
      this.siteConfig = config;
      toast.success('Site configuration saved');
    } catch (err) {
      if (err instanceof SyntaxError) {
        toast.error('Invalid JSON: ' + err.message);
      } else {
        toast.error('Failed to save configuration');
      }
    }
  }
  
  async loadEmailTemplates() {
    try {
      const response = await api.get('/settings/email-templates');
      if (response.ok) {
        this.emailTemplates = await response.json();
      } else {
        this.emailTemplates = this.getDefaultEmailTemplates();
      }
    } catch {
      this.emailTemplates = this.getDefaultEmailTemplates();
    }
    
    this.renderEmailTemplates();
  }
  
  getDefaultEmailTemplates() {
    return [
      {
        id: 1,
        name: 'Order Confirmation',
        subject: 'Order Confirmation - {{order_number}}',
        html_content: '<h1>Thank you for your order!</h1><p>Your order {{order_number}} has been confirmed.</p>',
        variables: ['order_number', 'customer_name', 'order_total', 'order_items'],
        is_active: true,
        created_at: '2024-01-01T10:00:00Z'
      },
      {
        id: 2,
        name: 'Shipping Notification',
        subject: 'Your order {{order_number}} has shipped!',
        html_content: '<h1>Great news!</h1><p>Your order {{order_number}} is on its way.</p>',
        variables: ['order_number', 'customer_name', 'tracking_number', 'tracking_url'],
        is_active: true,
        created_at: '2024-01-01T10:00:00Z'
      },
      {
        id: 3,
        name: 'Welcome Email',
        subject: 'Welcome to Maison Hygia!',
        html_content: '<h1>Welcome {{customer_name}}!</h1><p>Thank you for joining our community.</p>',
        variables: ['customer_name', 'account_url'],
        is_active: true,
        created_at: '2024-01-01T10:00:00Z'
      },
      {
        id: 4,
        name: 'Password Reset',
        subject: 'Reset your password',
        html_content: '<h1>Password Reset</h1><p>Click <a href="{{reset_url}}">here</a> to reset your password.</p>',
        variables: ['customer_name', 'reset_url'],
        is_active: true,
        created_at: '2024-01-01T10:00:00Z'
      }
    ];
  }
  
  renderEmailTemplates() {
    if (this.emailTemplates.length === 0) {
      this.emailTemplatesList.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-description">No email templates found. Create your first template to get started.</p>
        </div>
      `;
      return;
    }
    
    this.emailTemplatesList.innerHTML = this.emailTemplates.map(template => `
      <div class="email-template-item" data-id="${template.id}">
        <div class="email-template-info">
          <div class="email-template-name">${this.escapeHtml(template.name)}</div>
          <div class="email-template-subject">${this.escapeHtml(template.subject)}</div>
        </div>
        <div class="email-template-actions">
          <span class="badge ${template.is_active ? 'badge-success' : 'badge-neutral'}">${template.is_active ? 'Active' : 'Inactive'}</span>
          <button class="btn btn-ghost btn-sm preview-btn" data-id="${template.id}" aria-label="Preview">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="btn btn-ghost btn-sm edit-btn" data-id="${template.id}" aria-label="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-ghost btn-sm danger delete-btn" data-id="${template.id}" aria-label="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
    
    // Bind events
    this.emailTemplatesList.querySelectorAll('.preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const template = this.emailTemplates.find(t => t.id === id);
        if (template) this.previewTemplate(template);
      });
    });
    
    this.emailTemplatesList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const template = this.emailTemplates.find(t => t.id === id);
        if (template) this.openTemplateModal(template);
      });
    });
    
    this.emailTemplatesList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        await this.deleteTemplate(id);
      });
    });
  }
  
  openTemplateModal(template) {
    const isEdit = !!template;
    
    const modal = new Modal({
      title: isEdit ? 'Edit Email Template' : 'Create Email Template',
      size: 'lg',
      destroyOnClose: true
    });
    
    const variables = [
      'customer_name', 'customer_email', 'order_number', 'order_total',
      'order_items', 'tracking_number', 'tracking_url', 'reset_url',
      'account_url', 'site_name', 'site_url'
    ];
    
    modal.setContent(`
      <form id="templateForm">
        <div class="form-group">
          <label class="form-label" for="templateName">Template Name <span class="form-required"></span></label>
          <input type="text" class="form-input" id="templateName" name="name" value="${this.escapeHtml(template?.name || '')}" required placeholder="e.g., Order Confirmation">
        </div>
        
        <div class="form-group">
          <label class="form-label" for="templateSubject">Subject Line <span class="form-required"></span></label>
          <input type="text" class="form-input" id="templateSubject" name="subject" value="${this.escapeHtml(template?.subject || '')}" required placeholder="e.g., Order Confirmation - {{order_number}}">
        </div>
        
        <div class="form-group">
          <label class="form-label" for="templateHtml">HTML Content <span class="form-required"></span></label>
          <textarea class="form-input form-textarea" id="templateHtml" name="html_content" rows="15" required placeholder="Enter HTML content...">${this.escapeHtml(template?.html_content || '')}</textarea>
          <div class="form-hint">Available variables: {{${variables.join('}}, {{')}}}</div>
        </div>
        
        <div class="form-group">
          <label class="form-switch">
            <input type="checkbox" class="form-switch-input" id="templateActive" name="is_active" ${template?.is_active !== false ? 'checked' : ''}>
            <span class="form-switch-track"></span>
            <span class="form-switch-label">Active</span>
          </label>
        </div>
        
        <div class="form-group">
          <label class="form-label">Preview</label>
          <div class="email-template-preview">
            <div class="email-template-preview-header">
              <span class="email-template-preview-title">Live Preview</span>
              <button type="button" class="btn btn-ghost btn-sm refresh-preview" id="refreshPreview">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Refresh
              </button>
            </div>
            <iframe class="email-template-preview-iframe" id="templatePreview" sandbox="allow-scripts allow-same-origin"></iframe>
          </div>
        </div>
      </form>
    `);
    
    modal.setFooter(`
      <button class="btn btn-secondary" data-action="cancel">Cancel</button>
      ${isEdit ? '<button class="btn btn-danger" data-action="delete">Delete</button>' : ''}
      <button class="btn btn-primary" data-action="save" type="submit" form="templateForm">${isEdit ? 'Save Changes' : 'Create Template'}</button>
    `);
    
    // Bind events
    const previewBtn = modal.element.querySelector('#refreshPreview');
    const previewFrame = modal.element.querySelector('#templatePreview');
    
    const updatePreview = () => {
      const html = modal.element.querySelector('#templateHtml').value;
      const subject = modal.element.querySelector('#templateSubject').value;
      
      // Replace variables with sample data
      const sampleData = {
        customer_name: 'Sarah Johnson',
        customer_email: 'sarah@example.com',
        order_number: '#10000001',
        order_total: '$125.50',
        order_items: '<li>Radiant Face Oil (30ml) - $48.00</li><li>Herbal Hair Mask (100g) - $36.00</li>',
        tracking_number: '1Z999AA10123456784',
        tracking_url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=1Z999AA10123456784',
        reset_url: 'https://maisonhygia.adityanair.tech/reset?token=abc123',
        account_url: 'https://maisonhygia.adityanair.tech/account',
        site_name: 'Maison Hygia',
        site_url: 'https://maisonhygia.adityanair.tech'
      };
      
      let previewHtml = html;
      Object.entries(sampleData).forEach(([key, value]) => {
        previewHtml = previewHtml.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      });
      
      previewFrame.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1A1A1A; padding: 20px; margin: 0; }
            a { color: #C8A951; }
            .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; }
          </style>
        </head>
        <body>
          ${previewHtml}
        </body>
        </html>
      `;
    };
    
    previewBtn.addEventListener('click', updatePreview);
    modal.element.querySelector('#templateHtml').addEventListener('input', debounce(updatePreview, 500));
    
    // Initial preview
    setTimeout(updatePreview, 100);
    
    modal.element.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.close());
    
    const deleteBtn = modal.element.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await Modal.confirm('Delete Template', 'Are you sure you want to delete this template?', { danger: true });
        if (confirmed) {
          await this.deleteTemplate(template.id);
          modal.close();
        }
      });
    }
    
    modal.element.querySelector('[data-action="save"]').addEventListener('click', async (e) => {
      e.preventDefault();
      await this.saveTemplate(template?.id, modal);
    });
    
    modal.open();
  }
  
  async saveTemplate(id, modal) {
    const form = modal.element.querySelector('#templateForm');
    const formData = new FormData(form);
    
    const templateData = {
      name: formData.get('name'),
      subject: formData.get('subject'),
      html_content: formData.get('html_content'),
      is_active: formData.get('is_active') === 'on'
    };
    
    try {
      if (id) {
        await api.put(`/settings/email-templates/${id}`, templateData);
        toast.success('Template updated');
      } else {
        await api.post('/settings/email-templates', templateData);
        toast.success('Template created');
      }
      
      modal.close();
      this.loadEmailTemplates();
    } catch (err) {
      toast.error(id ? 'Failed to update template' : 'Failed to create template');
    }
  }
  
  async deleteTemplate(id) {
    try {
      await api.delete(`/settings/email-templates/${id}`);
      toast.success('Template deleted');
      this.loadEmailTemplates();
    } catch (err) {
      toast.error('Failed to delete template');
    }
  }
  
  previewTemplate(template) {
    const modal = new Modal({
      title: `Preview: ${template.name}`,
      size: 'lg',
      destroyOnClose: true
    });
    
    const sampleData = {
      customer_name: 'Sarah Johnson',
      customer_email: 'sarah@example.com',
      order_number: '#10000001',
      order_total: '$125.50',
      order_items: '<li>Radiant Face Oil (30ml) - $48.00</li><li>Herbal Hair Mask (100g) - $36.00</li>',
      tracking_number: '1Z999AA10123456784',
      tracking_url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=1Z999AA10123456784',
      reset_url: 'https://maisonhygia.adityanair.tech/reset?token=abc123',
      account_url: 'https://maisonhygia.adityanair.tech/account',
      site_name: 'Maison Hygia',
      site_url: 'https://maisonhygia.adityanair.tech'
    };
    
    let previewHtml = template.html_content;
    Object.entries(sampleData).forEach(([key, value]) => {
      previewHtml = previewHtml.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    
    modal.setContent(`
      <div class="email-template-preview">
        <iframe class="email-template-preview-iframe" id="templatePreview" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
    `);
    
    modal.setFooter(`
      <button class="btn btn-secondary" data-action="close">Close</button>
    `);
    
    modal.element.querySelector('[data-action="close"]').addEventListener('click', () => modal.close());
    
    modal.open();
    
    // Set iframe content after modal opens
    setTimeout(() => {
      const frame = modal.element.querySelector('#templatePreview');
      frame.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1A1A1A; padding: 20px; margin: 0; }
            a { color: #C8A951; }
            .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; }
          </style>
        </head>
        <body>
          ${previewHtml}
        </body>
        </html>
      `;
    }, 100);
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
  destroy() {
    // Cleanup if needed
  }
}

export default SettingsPage;