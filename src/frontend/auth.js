/**
 * Frontend Authentication Helper
 * Handles login, logout, token management, and authenticated API calls
 */

const auth = {
  /**
   * Get stored authentication token
   */
  getToken() {
    return localStorage.getItem('authToken');
  },

  /**
   * Store authentication token
   */
  setToken(token) {
    localStorage.setItem('authToken', token);
  },

  /**
   * Clear authentication token
   */
  clearToken() {
    localStorage.removeItem('authToken');
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.getToken() !== null;
  },

  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  /**
   * Logout (clear local token)
   */
  async logout() {
    try {
      const token = this.getToken();
      if (token) {
        // Notify backend (optional)
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }).catch(() => {}); // Ignore errors
      }

      this.clearToken();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Logout error:', error);
      this.clearToken();
      window.location.href = '/login.html';
    }
  },

  /**
   * Get current user
   */
  async getCurrentUser() {
    try {
      const response = await this.apiCall('/api/users/me');
      if (!response.ok) throw new Error('Failed to get user');
      return await response.json();
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },

  /**
   * Make authenticated API call
   * Automatically includes auth token in headers
   * Handles token expiration
   */
  async apiCall(url, options = {}) {
    const token = this.getToken();

    if (!token) {
      console.error('No auth token found');
      this.redirectToLogin();
      return null;
    }

    // Merge headers
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Token expired or invalid
      if (response.status === 401) {
        console.warn('Token expired, redirecting to login');
        this.redirectToLogin();
        return null;
      }

      // Permission denied
      if (response.status === 403) {
        console.error('Access denied');
        return response;
      }

      return response;
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  },

  /**
   * Check authentication and redirect if needed
   */
  checkAuth() {
    if (!this.isAuthenticated()) {
      this.redirectToLogin();
      return false;
    }
    return true;
  },

  /**
   * Redirect to login page
   */
  redirectToLogin() {
    this.clearToken();
    window.location.href = '/login.html';
  },

  ensureChangePasswordModal() {
    if (document.getElementById('sharedChangePasswordModal')) {
      return;
    }

    const styleId = 'shared-change-password-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .password-modal {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.48);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 1200;
        }
        .password-modal-content {
          width: min(480px, calc(100vw - 24px));
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.26);
          border: 1px solid #e5eef8;
          overflow: hidden;
        }
        .password-modal-head {
          padding: 14px 16px;
          border-bottom: 1px solid #edf2f7;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .password-modal-head h2 {
          margin: 0;
          font-size: 1.1rem;
          color: #0e2a47;
        }
        .password-modal-close {
          background: transparent;
          border: 0;
          font-size: 22px;
          cursor: pointer;
          color: #557190;
          line-height: 1;
        }
        .password-modal-body {
          padding: 16px;
        }
        .password-field {
          margin-bottom: 12px;
        }
        .password-field label {
          display: block;
          margin-bottom: 4px;
          color: #35587d;
          font-weight: 600;
          font-size: 0.9rem;
        }
        .password-field input {
          width: 100%;
          border: 1px solid #d6e2f0;
          border-radius: 8px;
          padding: 9px 10px;
          font-size: 14px;
        }
        .password-modal-status {
          min-height: 20px;
          font-size: 0.88rem;
          color: #b42318;
          margin-bottom: 8px;
        }
        .password-modal-status.ok {
          color: #067a00;
        }
        .password-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 14px 16px;
          border-top: 1px solid #edf2f7;
        }
        .password-modal-btn {
          border: 0;
          border-radius: 8px;
          padding: 9px 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .password-modal-btn.secondary {
          background: #eef3f9;
          color: #23466b;
        }
        .password-modal-btn.primary {
          background: #2667c9;
          color: #ffffff;
        }
      `;
      document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.id = 'sharedChangePasswordModal';
    modal.className = 'password-modal';
    modal.innerHTML = `
      <div class="password-modal-content" role="dialog" aria-modal="true" aria-labelledby="sharedChangePasswordTitle">
        <div class="password-modal-head">
          <h2 id="sharedChangePasswordTitle">Change Password</h2>
          <button class="password-modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="password-modal-body">
          <div class="password-field">
            <label for="sharedCurrentPassword">Current Password</label>
            <input id="sharedCurrentPassword" type="password" />
          </div>
          <div class="password-field">
            <label for="sharedNewPassword">New Password</label>
            <input id="sharedNewPassword" type="password" />
          </div>
          <div class="password-field">
            <label for="sharedConfirmPassword">Confirm Password</label>
            <input id="sharedConfirmPassword" type="password" />
          </div>
          <div id="sharedChangePasswordStatus" class="password-modal-status"></div>
        </div>
        <div class="password-modal-actions">
          <button id="sharedCancelPasswordBtn" class="password-modal-btn secondary" type="button">Cancel</button>
          <button id="sharedSubmitPasswordBtn" class="password-modal-btn primary" type="button">Change Password</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        this.closeChangePasswordModal();
      }
    });

    modal.querySelector('.password-modal-close')?.addEventListener('click', () => this.closeChangePasswordModal());
    modal.querySelector('#sharedCancelPasswordBtn')?.addEventListener('click', () => this.closeChangePasswordModal());
    modal.querySelector('#sharedSubmitPasswordBtn')?.addEventListener('click', () => this.submitChangePassword());
  },

  openChangePasswordModal() {
    this.ensureChangePasswordModal();
    const modal = document.getElementById('sharedChangePasswordModal');
    if (!modal) return;

    const currentPassword = document.getElementById('sharedCurrentPassword');
    const newPassword = document.getElementById('sharedNewPassword');
    const confirmPassword = document.getElementById('sharedConfirmPassword');
    const status = document.getElementById('sharedChangePasswordStatus');

    if (currentPassword) currentPassword.value = '';
    if (newPassword) newPassword.value = '';
    if (confirmPassword) confirmPassword.value = '';
    if (status) {
      status.textContent = '';
      status.classList.remove('ok');
    }

    modal.style.display = 'flex';
    currentPassword?.focus();
  },

  closeChangePasswordModal() {
    const modal = document.getElementById('sharedChangePasswordModal');
    if (modal) {
      modal.style.display = 'none';
    }
  },

  async submitChangePassword() {
    const token = this.getToken();
    if (!token) {
      this.redirectToLogin();
      return;
    }

    const currentPassword = document.getElementById('sharedCurrentPassword')?.value || '';
    const newPassword = document.getElementById('sharedNewPassword')?.value || '';
    const confirmPassword = document.getElementById('sharedConfirmPassword')?.value || '';
    const status = document.getElementById('sharedChangePasswordStatus');
    const submitBtn = document.getElementById('sharedSubmitPasswordBtn');

    if (!currentPassword || !newPassword || !confirmPassword) {
      if (status) status.textContent = 'All fields are required.';
      return;
    }
    if (newPassword !== confirmPassword) {
      if (status) status.textContent = 'New passwords do not match.';
      return;
    }
    if (newPassword.length < 6) {
      if (status) status.textContent = 'New password must be at least 6 characters.';
      return;
    }
    if (currentPassword === newPassword) {
      if (status) status.textContent = 'New password must be different from current password.';
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (status) {
      status.textContent = 'Saving...';
      status.classList.remove('ok');
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (status) status.textContent = data.error || 'Failed to change password.';
        return;
      }

      if (status) {
        status.textContent = 'Password changed successfully.';
        status.classList.add('ok');
      }
      setTimeout(() => this.closeChangePasswordModal(), 800);
    } catch (error) {
      if (status) status.textContent = error.message || 'Unexpected error occurred.';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  ensureAdminPendingBadgeStyle() {
    const styleId = 'shared-admin-pending-badge-style';
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .shared-admin-pending-badge {
        position: absolute;
        top: -7px;
        right: -8px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: #dc2626;
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.7);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  },

  clearAdminPendingBadge(adminBtn) {
    if (!adminBtn) return;
    const existing = adminBtn.querySelector('.shared-admin-pending-badge');
    if (existing) {
      existing.remove();
    }
  },

  setAdminPendingBadge(adminBtn, pendingCount) {
    if (!adminBtn || !Number.isFinite(Number(pendingCount)) || Number(pendingCount) <= 0) {
      this.clearAdminPendingBadge(adminBtn);
      return;
    }

    this.ensureAdminPendingBadgeStyle();
    this.clearAdminPendingBadge(adminBtn);

    if (!adminBtn.style.position) {
      adminBtn.style.position = 'relative';
    }

    const badge = document.createElement('span');
    badge.className = 'shared-admin-pending-badge';
    badge.textContent = Number(pendingCount) > 99 ? '99+' : String(Number(pendingCount));
    badge.title = `${badge.textContent} pending access request(s)`;
    adminBtn.appendChild(badge);
  },

  async refreshAdminPendingBadge(adminBtn, token) {
    if (!adminBtn || !token || adminBtn.style.display === 'none') {
      this.clearAdminPendingBadge(adminBtn);
      return;
    }

    try {
      const response = await fetch('/api/admin/access-requests/pending-count', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        this.clearAdminPendingBadge(adminBtn);
        return;
      }

      const data = await response.json().catch(() => ({}));
      this.setAdminPendingBadge(adminBtn, Number(data?.pendingCount || 0));
    } catch (_error) {
      this.clearAdminPendingBadge(adminBtn);
    }
  },

  async configureHeaderButtons(options = {}) {
    const {
      changePasswordBtnId = 'changePasswordBtn',
      adminBtnId = 'adminBtn',
      adminPath = '/admin-access.html'
    } = options;

    const changePasswordBtn = document.getElementById(changePasswordBtnId);
    const adminBtn = document.getElementById(adminBtnId);

    if (changePasswordBtn && !changePasswordBtn.dataset.boundSharedHeader) {
      changePasswordBtn.dataset.boundSharedHeader = '1';
      changePasswordBtn.addEventListener('click', () => this.openChangePasswordModal());
    }

    if (adminBtn) {
      adminBtn.style.display = 'none';
      if (!adminBtn.dataset.boundSharedHeader) {
        adminBtn.dataset.boundSharedHeader = '1';
        adminBtn.addEventListener('click', () => {
          window.location.href = adminPath;
        });
      }
    }

    if (changePasswordBtn) {
      changePasswordBtn.style.display = 'none';
    }

    const token = this.getToken();
    if (!token) {
      return;
    }

    let groups = [];
    let pages = {};

    try {
      const [groupsRes, accessRes] = await Promise.allSettled([
        fetch('/api/auth/me/groups', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/auth/me/access-permissions', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (groupsRes.status === 'fulfilled' && groupsRes.value.ok) {
        groups = await groupsRes.value.json();
      }
      if (accessRes.status === 'fulfilled' && accessRes.value.ok) {
        const accessData = await accessRes.value.json();
        pages = accessData?.pages || {};
      }
    } catch (error) {
      console.warn('Header buttons setup failed:', error);
    }

    const isTestGroup = groups.some((group) => group.name === 'Test Group');
    if (changePasswordBtn && !isTestGroup) {
      changePasswordBtn.style.display = 'inline-block';
    }

    const isAdminByGroup = groups.some((group) => group.name === 'Admin');
    const hasAdminPageAccess = !!pages['admin-access']?.read;
    if (adminBtn && (isAdminByGroup || hasAdminPageAccess)) {
      adminBtn.style.display = 'inline-block';
      await this.refreshAdminPendingBadge(adminBtn, token);
    }
  },

  /**
   * Get user initials for avatar
   */
  getInitials(name) {
    if (!name) return '?';
    return name.split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
};

/**
 * Initialize auth on page load
 * Redirect to login if not authenticated (except on login page)
 */
window.addEventListener('load', () => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const loginPages = ['login.html', ''];

  if (!loginPages.includes(currentPage) && !auth.isAuthenticated()) {
    auth.redirectToLogin();
  }
});
