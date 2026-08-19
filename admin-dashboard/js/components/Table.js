/**
 * Maison Hygia Admin Dashboard - Table Component
 * Sortable, paginated, responsive table
 */

export class Table {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      columns: [],
      data: [],
      sortable: true,
      pagination: true,
      pageSize: 20,
      pageSizes: [10, 20, 50, 100],
      rowKey: 'id',
      selectable: false,
      onRowClick: null,
      onSort: null,
      onPageChange: null,
      onSelectionChange: null,
      renderCell: null,
      emptyMessage: 'No data available',
      loading: false,
      ...options
    };
    
    this.state = {
      sortColumn: null,
      sortDirection: 'asc',
      currentPage: 1,
      totalItems: this.options.data.length,
      selectedIds: new Set()
    };
    
    this.render();
    this.bindEvents();
  }
  
  render() {
    const { columns, data, loading, emptyMessage, pagination, pageSize } = this.options;
    const { sortColumn, sortDirection, currentPage, selectedIds } = this.state;
    
    // Sort data if needed
    let sortedData = [...data];
    if (sortColumn) {
      sortedData.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        const direction = sortDirection === 'asc' ? 1 : -1;
        
        if (aVal < bVal) return -1 * direction;
        if (aVal > bVal) return 1 * direction;
        return 0;
      });
    }
    
    // Paginate data
    let paginatedData = sortedData;
    if (pagination) {
      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;
      paginatedData = sortedData.slice(start, end);
      this.state.totalItems = sortedData.length;
    }
    
    // Generate columns HTML
    const columnsHtml = columns.map(col => {
      const sortable = this.options.sortable && col.sortable !== false;
      const sortIcon = sortable && sortColumn === col.key 
        ? `<span class="sort-icon ${sortDirection}">${sortDirection === 'asc' ? '▲' : '▼'}</span>`
        : sortable ? '<span class="sort-icon">⇅</span>' : '';
      
      return `
        <th 
          scope="col" 
          ${sortable ? `class="sortable" data-sort="${col.key}"` : ''}
          style="${col.width ? `width: ${col.width};` : ''}"
        >
          ${this.escapeHtml(col.label)}
          ${sortIcon}
        </th>
      `;
    }).join('');
    
    // Generate rows HTML
    let rowsHtml = '';
    if (loading) {
      rowsHtml = `
        <tr>
          <td colspan="${columns.length}" class="loading-state">
            <div class="spinner"></div>
            <div class="loading-text">Loading...</div>
          </td>
        </tr>
      `.repeat(5);
    } else if (paginatedData.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="${columns.length}" class="empty-state">
            <div class="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            <p class="empty-state-description">${this.escapeHtml(emptyMessage)}</p>
          </td>
        </tr>
      `;
    } else {
      rowsHtml = paginatedData.map(row => {
        const rowKey = row[this.options.rowKey];
        const isSelected = selectedIds.has(rowKey);
        const cellsHtml = columns.map(col => {
          let cellContent = '';
          
          if (this.options.renderCell && col.key) {
            cellContent = this.options.renderCell(row, col, rowKey);
          } else if (col.render) {
            cellContent = col.render(row, col, rowKey);
          } else {
            cellContent = this.escapeHtml(row[col.key] ?? '');
          }
          
          return `
            <td data-label="${this.escapeHtml(col.label)}">
              ${cellContent}
            </td>
          `;
        }).join('');
        
        const selectCell = this.options.selectable 
          ? `<td data-label=""><input type="checkbox" class="form-checkbox row-select" value="${this.escapeHtml(rowKey)}" ${isSelected ? 'checked' : ''} aria-label="Select row"></td>`
          : '';
        
        return `
          <tr 
            data-row-key="${this.escapeHtml(rowKey)}"
            ${isSelected ? 'class="selected"' : ''}
            ${this.options.onRowClick ? 'tabindex="0" role="button" aria-pressed="false"' : ''}
          >
            ${selectCell}
            ${cellsHtml}
          </tr>
        `;
      }).join('');
    }
    
    // Pagination HTML
    let paginationHtml = '';
    if (pagination && this.state.totalItems > pageSize) {
      const totalPages = Math.ceil(this.state.totalItems / pageSize);
      const pages = this._getPageNumbers(currentPage, totalPages);
      
      paginationHtml = `
        <nav class="pagination" aria-label="Pagination">
          <button class="pagination-btn" data-page="first" ${currentPage === 1 ? 'disabled' : ''} aria-label="First page">
            ««
          </button>
          <button class="pagination-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous page">
            «
          </button>
          ${pages.map(p => {
            if (p === '...') {
              return '<span class="pagination-ellipsis">…</span>';
            }
            return `<button class="pagination-btn ${p === currentPage ? 'active' : ''}" data-page="${p}" aria-label="Page ${p}" ${p === currentPage ? 'aria-current="page"' : ''}>${p}</button>`;
          }).join('')}
          <button class="pagination-btn" data-page="next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next page">
            »
          </button>
          <button class="pagination-btn" data-page="last" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Last page">
            »»
          </button>
        </nav>
      `;
    }
    
    this.container.innerHTML = `
      <div class="table-container" role="region" aria-label="Data table" tabindex="0">
        <table class="table" role="grid">
          <thead>
            <tr role="row">
              ${this.options.selectable ? '<th scope="col"><input type="checkbox" class="form-checkbox" id="selectAll" aria-label="Select all rows"></th>' : ''}
              ${columnsHtml}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    `;
    
    // Update select all checkbox
    if (this.options.selectable) {
      const selectAll = this.container.querySelector('#selectAll');
      const rowCheckboxes = this.container.querySelectorAll('.row-select');
      const allSelected = rowCheckboxes.length > 0 && Array.from(rowCheckboxes).every(cb => cb.checked);
      selectAll.checked = allSelected;
      selectAll.indeterminate = !allSelected && Array.from(rowCheckboxes).some(cb => cb.checked);
    }
  }
  
  _getPageNumbers(current, total) {
    const pages = [];
    const delta = 2;
    
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    
    return pages;
  }
  
  bindEvents() {
    // Sorting
    if (this.options.sortable) {
      this.container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const column = th.dataset.sort;
          this.handleSort(column);
        });
        
        // Keyboard support
        th.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const column = th.dataset.sort;
            this.handleSort(column);
          }
        });
      });
    }
    
    // Row selection
    if (this.options.selectable) {
      const selectAll = this.container.querySelector('#selectAll');
      if (selectAll) {
        selectAll.addEventListener('change', () => {
          const checkboxes = this.container.querySelectorAll('.row-select');
          checkboxes.forEach(cb => {
            cb.checked = selectAll.checked;
            const rowKey = cb.value;
            if (selectAll.checked) {
              this.state.selectedIds.add(rowKey);
            } else {
              this.state.selectedIds.delete(rowKey);
            }
          });
          this._notifySelectionChange();
          this.render(); // Re-render to update row styles
        });
      }
      
      this.container.querySelectorAll('.row-select').forEach(cb => {
        cb.addEventListener('change', () => {
          const rowKey = cb.value;
          if (cb.checked) {
            this.state.selectedIds.add(rowKey);
          } else {
            this.state.selectedIds.delete(rowKey);
          }
          this._notifySelectionChange();
          this.render(); // Update select all state
        });
      });
    }
    
    // Row click
    if (this.options.onRowClick) {
      this.container.querySelectorAll('tbody tr[tabindex="0"]').forEach(tr => {
        tr.addEventListener('click', () => {
          const rowKey = tr.dataset.rowKey;
          const rowData = this.options.data.find(r => r[this.options.rowKey] === rowKey);
          this.options.onRowClick(rowData, rowKey);
        });
        
        tr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const rowKey = tr.dataset.rowKey;
            const rowData = this.options.data.find(r => r[this.options.rowKey] === rowKey);
            this.options.onRowClick(rowData, rowKey);
          }
        });
      });
    }
    
    // Pagination
    if (this.options.pagination) {
      this.container.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = btn.dataset.page;
          this.handlePageChange(page);
        });
      });
    }
  }
  
  handleSort(column) {
    if (this.state.sortColumn === column) {
      this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.state.sortColumn = column;
      this.state.sortDirection = 'asc';
    }
    
    if (this.options.onSort) {
      this.options.onSort(column, this.state.sortDirection);
    }
    
    this.render();
  }
  
  handlePageChange(page) {
    const totalPages = Math.ceil(this.state.totalItems / this.options.pageSize);
    let newPage = this.state.currentPage;
    
    switch (page) {
      case 'first': newPage = 1; break;
      case 'last': newPage = totalPages; break;
      case 'prev': newPage = Math.max(1, this.state.currentPage - 1); break;
      case 'next': newPage = Math.min(totalPages, this.state.currentPage + 1); break;
      default: newPage = parseInt(page); break;
    }
    
    if (newPage !== this.state.currentPage && newPage >= 1 && newPage <= totalPages) {
      this.state.currentPage = newPage;
      
      if (this.options.onPageChange) {
        this.options.onPageChange(newPage);
      }
      
      this.render();
    }
  }
  
  _notifySelectionChange() {
    if (this.options.onSelectionChange) {
      this.options.onSelectionChange(Array.from(this.state.selectedIds));
    }
  }
  
  // Public methods
  setData(data) {
    this.options.data = data;
    this.state.currentPage = 1;
    this.render();
  }
  
  setLoading(loading) {
    this.options.loading = loading;
    this.render();
  }
  
  setTotalItems(total) {
    this.state.totalItems = total;
    this.render();
  }
  
  getSelectedIds() {
    return Array.from(this.state.selectedIds);
  }
  
  clearSelection() {
    this.state.selectedIds.clear();
    this.render();
  }
  
  destroy() {
    // Clean up if needed
  }
  
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

export default Table;