# Maison Hygia Admin Dashboard

Production-ready admin dashboard for Maison Hygia e-commerce platform. Built with vanilla HTML, CSS, and ES6+ JavaScript modules — no frameworks, no build step required.

## 🎨 Features

- **Design System**: Complete CSS custom properties (variables) for theming, spacing, typography, colors
- **Dark/Light Mode**: Full theme switching with localStorage persistence
- **Responsive Layout**: Collapsible sidebar, mobile drawer, adaptive tables
- **Authentication**: Cognito Hosted UI with PKCE, automatic token refresh
- **Hash Routing**: SPA navigation with route guards
- **Component Library**: Tables, Modals, Forms, Charts, Toasts, Dropdowns
- **Accessibility**: WCAG AA compliant, keyboard navigation, ARIA labels

## 📁 Project Structure

```
admin-dashboard/
├── index.html              # Entry point
├── manifest.json           # PWA manifest
├── assets/
│   └── logo.svg           # Brand logo
├── css/
│   ├── variables.css      # Design tokens (colors, spacing, typography)
│   ├── reset.css          # Normalize & base styles
│   ├── layout.css         # Sidebar, header, grid system
│   ├── components.css     # Buttons, forms, tables, modals, badges
│   ├── pages.css          # Page-specific styles
│   └── darkmode.css       # Dark theme overrides
└── js/
    ├── app.js             # Main entry, routing, initialization
    ├── store.js           # Reactive state management
    ├── auth.js            # Cognito auth, PKCE, token management
    ├── api.js             # Fetch wrapper with interceptors
    ├── router.js          # Hash-based router with guards
    ├── components/
    │   ├── Sidebar.js     # Navigation sidebar
    │   ├── Header.js      # Top header bar
    │   ├── Table.js       # Sortable, paginated data table
    │   ├── Modal.js       # Accessible modal dialogs
    │   ├── Form.js        # Form handling & validation
    │   ├── Chart.js       # Chart.js wrapper
    │   └── Toast.js       # Notification toasts
    ├── pages/
    │   ├── LoginPage.js
    │   ├── CallbackPage.js
    │   ├── DashboardPage.js
    │   ├── ProductsPage.js
    │   ├── OrdersPage.js
    │   ├── UsersPage.js
    │   └── InventoryPage.js
    └── utils/
        ├── formatters.js  # Currency, dates, numbers
        ├── validators.js  # Form validation rules
        └── helpers.js     # Debounce, throttle, utilities
```

## 🚀 Quick Start

### Development

```bash
# Serve locally (any static server)
npx serve admin-dashboard
# or
python3 -m http.server 8000 -d admin-dashboard
# or
php -S localhost:8000 -t admin-dashboard
```

Open `http://localhost:8000` in your browser.

### Configuration

Update the meta tags in `index.html` with your Cognito credentials and API base URL:

```html
<meta name="cognito-client-id" content="YOUR_CLIENT_ID">
<meta name="cognito-domain" content="auth.maisonhygia.adityanair.tech">
<meta name="api-base-url" content="https://api.maisonhygia.adityanair.tech/api/v1/admin">
```

`js/api.js` reads `api-base-url` and falls back to the default above if the tag is missing.

## 🔐 Authentication Flow

1. **Login Page** (`#login`) → Click "Sign in with Cognito"
2. **Redirects** to Cognito Hosted UI
3. **Callback** (`#callback`) → Exchanges code for tokens via PKCE
4. **Tokens stored** in `sessionStorage` (access, refresh, ID)
5. **Auto-refresh** 5 minutes before expiry
6. **Dashboard** (`#dashboard`) → Protected route

### Token Storage

```
sessionStorage:
  - access_token
  - refresh_token
  - id_token
  - expires_at (timestamp)
  - user (parsed from ID token)
```

## 🎯 Pages Overview

| Route | Page | Description |
|-------|------|-------------|
| `#login` | Login | Cognito authentication |
| `#callback` | Callback | OAuth code exchange |
| `#dashboard` | Dashboard | KPIs, revenue chart, recent orders |
| `#products` | Products | CRUD, variants, images |
| `#orders` | Orders | List, detail, status, refunds |
| `#users` | Users | List, roles, enable/disable |
| `#inventory` | Inventory | Stock levels, bulk edit |

## 🛠 API Integration

The `ApiClient` in `js/api.js` targets:
```
https://api.maisonhygia.adityanair.tech/api/v1/admin/
```

### Expected Endpoints

```
GET    /dashboard/kpis
GET    /dashboard/revenue?days=30
GET    /products?page=1&limit=20
POST   /products
PUT    /products/:id
DELETE /products/:id
POST   /upload-url
GET    /orders?page=1&limit=20
PUT    /orders/:id
POST   /orders/:id/refund
GET    /users?page=1&limit=20
PUT    /users/:id/role
PUT    /users/:id (enable/disable)
GET    /inventory?page=1&limit=50
PUT    /inventory/bulk
```

### Response Format

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

## 🌙 Theming

CSS Variables (in `variables.css`):

```css
:root {
  --color-gold: #C8A951;
  --color-dark: #1A1A1A;
  --color-light: #F5F0E8;
  /* ... more tokens */
}

[data-theme="dark"] {
  --color-dark: #F5F0E8;
  --color-light: #1A1A1A;
  /* ... dark overrides */
}
```

Switch themes:
```javascript
store.toggleTheme(); // or store.setTheme('dark')
```

## 📱 Responsive Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 640px | Sidebar → drawer, tables → cards |
| Tablet | 640-1023px | Condensed sidebar |
| Desktop | ≥ 1024px | Full sidebar |

## ♿ Accessibility

- Semantic HTML5 elements (`<nav>`, `<main>`, `<aside>`, `<header>`)
- ARIA labels on all interactive elements
- Focus visible outlines (`:focus-visible`)
- Keyboard navigation (Tab, Enter, Escape)
- Color contrast ratios ≥ 4.5:1 (WCAG AA)
- Screen reader announcements for toasts/loading
- Reduced motion support

## 📦 Deployment

### S3 + CloudFront

1. Build not required — deploy `admin-dashboard/` folder directly
2. Configure CloudFront:
   - Origin: S3 bucket
   - Default root object: `index.html`
   - Error pages: 404 → `/index.html` (for SPA routing)
   - Cache behaviors: `*.js`, `*.css` → long TTL; `index.html` → no cache
3. Set Custom Error Response:
   - HTTP 404 → `/index.html` with 200 OK

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `COGNITO_CLIENT_ID` | Cognito App Client ID | Required |
| `COGNITO_DOMAIN` | Cognito Hosted UI domain | `auth.maisonhygia.adityanair.tech` |
| `API_BASE_URL` | Backend API URL | `https://api.maisonhygia.adityanair.tech/api/v1/admin` |

## 🔌 Backend Requirements

The dashboard requires the backend JSON API (all responses shaped `{data, total, page, limit}`). No mock fallback: if the API is unreachable, pages show an error toast and empty tables.

## 🔧 Customization

### Adding a New Page

1. Create `js/pages/NewPage.js` extending the page pattern
2. Add route in `app.js` → `setupRoutes()`
3. Add nav item in `Sidebar.js` → `render()`
4. Import and register in `app.js`

### Adding a Component

1. Create `js/components/ComponentName.js`
2. Export class with `render()`, `bindEvents()`, `destroy()`
3. Import where needed

### Extending Design Tokens

Add new variables to `css/variables.css`:

```css
:root {
  --color-brand-new: #HEXVALUE;
  --spacing-new: 1rem;
}
```

Use in components: `var(--color-brand-new)`

## 📋 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Uses modern JS features: ES6 modules, `fetch`, `crypto.subtle`, `ResizeObserver`, `IntersectionObserver`.

## 📄 License

Proprietary — Maison Hygia internal use only.

## 👥 Team

- **Design System**: UI Designer Agent
- **Architecture**: Full-stack JavaScript
- **Brand**: Maison Hygia — Ayurvedic Wellness