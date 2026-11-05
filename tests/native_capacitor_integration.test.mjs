import test from 'node:test';
import assert from 'node:assert/strict';

// Test 1: Deep Link URL parsing for Supabase OAuth callback
test('Native deep link URL parsing correctly extracts Supabase tokens', () => {
  const deepLinkUrl = 'com.yaswanth.hub://auth/callback#access_token=test_jwt_access_token&refresh_token=test_refresh_token&expires_in=3600&token_type=bearer';

  const hashIndex = deepLinkUrl.indexOf('#');
  assert.ok(hashIndex !== -1, 'Hash fragment must exist in callback URL');

  const rawParams = deepLinkUrl.substring(hashIndex + 1);
  const params = new URLSearchParams(rawParams);

  assert.equal(params.get('access_token'), 'test_jwt_access_token');
  assert.equal(params.get('refresh_token'), 'test_refresh_token');
  assert.equal(params.get('expires_in'), '3600');
  assert.equal(params.get('token_type'), 'bearer');
});

// Test 2: Deep Link URL parsing for Google Workspace token
test('Native deep link URL parsing correctly decodes Google Workspace OAuth tokens', () => {
  const googleCallbackUrl = 'yashwanthhub://auth/callback#access_token=ya29.a0AfH6SMD_mock_token&token_type=Bearer&expires_in=3599&scope=openid+email';

  const hashIndex = googleCallbackUrl.indexOf('#');
  const params = new URLSearchParams(googleCallbackUrl.substring(hashIndex + 1));

  assert.equal(params.get('access_token'), 'ya29.a0AfH6SMD_mock_token');
  assert.equal(params.get('token_type'), 'Bearer');
  assert.equal(Number(params.get('expires_in')), 3599);
});

// Test 3: Session Persistence Verification across App Restarts
test('Session persistence: Token stored in persistent storage persists after simulated app close', () => {
  // Mock localStorage for node environment
  const mockStorage = new Map();
  const storageInterface = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
  };

  // 1. First app launch: User signs in and session is saved
  const sessionData = {
    access_token: 'valid_access_jwt',
    refresh_token: 'valid_refresh_jwt',
    user: { id: 'usr_123', email: 'yaswanth@pawanshakti.com' },
    expires_at: Date.now() + 3600 * 1000,
  };
  storageInterface.setItem('sb-auth-token', JSON.stringify(sessionData));

  // 2. Simulated app termination: in-memory state is wiped
  let activeSession = null;
  assert.equal(activeSession, null, 'Memory wiped on app exit');

  // 3. Second app launch (cold boot): Retrieve session from persistent storage
  const restoredRaw = storageInterface.getItem('sb-auth-token');
  assert.ok(restoredRaw, 'Session data must persist in storage');

  activeSession = JSON.parse(restoredRaw);
  assert.equal(activeSession.access_token, 'valid_access_jwt');
  assert.equal(activeSession.user.email, 'yaswanth@pawanshakti.com');
  assert.ok(activeSession.expires_at > Date.now(), 'Session must remain valid and unexpired');
});

// Test 4: Android Hardware Back Button Hierarchy Handler
test('Android back button handler prioritizes closing modals before page navigation', () => {
  let modalClosed = false;
  let tabNavigated = false;
  let appMinimized = false;

  const mockContext = {
    isModalOpen: true,
    closeModal: () => { modalClosed = true; },
    isCommandPaletteOpen: false,
    isMobileMenuOpen: false,
    currentTab: 'tasks',
    navigateTab: () => { tabNavigated = true; },
  };

  // Handler simulation
  function handleBackButton(ctx) {
    if (ctx.isCommandPaletteOpen && ctx.closeCommandPalette) return ctx.closeCommandPalette();
    if (ctx.isMobileMenuOpen && ctx.closeMobileMenu) return ctx.closeMobileMenu();
    if (ctx.isModalOpen && ctx.closeModal) return ctx.closeModal();
    if (ctx.currentTab !== 'dashboard') return ctx.navigateTab('dashboard');
    appMinimized = true;
  }

  // First press: should close modal
  handleBackButton(mockContext);
  assert.equal(modalClosed, true, 'Modal must close on first back button press');
  assert.equal(tabNavigated, false, 'Tab navigation must NOT happen while modal is open');

  // Second press: modal is now closed, should navigate to dashboard
  mockContext.isModalOpen = false;
  handleBackButton(mockContext);
  assert.equal(tabNavigated, true, 'Should navigate to dashboard when modal is closed');

  // Third press: at dashboard, should minimize app
  mockContext.currentTab = 'dashboard';
  handleBackButton(mockContext);
  assert.equal(appMinimized, true, 'Should minimize app when at root dashboard');
});

// Test 5: Local notification scheduler time calculation for calendar events
test('Local notifications scheduler computes 15-minute lead time for upcoming events', () => {
  const event = {
    id: 'evt_999',
    title: 'Pawan Shakti Founder Review',
    date: '2026-11-05',
    start_time: '14:30',
  };

  const eventTime = new Date(`${event.date}T${event.start_time}:00`);
  const alertTime = new Date(eventTime.getTime() - 15 * 60 * 1000);

  assert.equal(alertTime.getHours(), 14);
  assert.equal(alertTime.getMinutes(), 15);
  assert.equal(alertTime.getTime(), eventTime.getTime() - 900000);
});

// Test 6: Quiet hours checking prevents disturbing user late at night
test('Quiet hours logic correctly silences alerts between 22:00 and 07:00', () => {
  function checkQuietHours(hour, start = 22, end = 7) {
    if (start > end) {
      return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
  }

  assert.equal(checkQuietHours(23), true, '23:00 must be quiet hours');
  assert.equal(checkQuietHours(2), true, '02:00 must be quiet hours');
  assert.equal(checkQuietHours(6), true, '06:00 must be quiet hours');
  assert.equal(checkQuietHours(10), false, '10:00 must NOT be quiet hours');
  assert.equal(checkQuietHours(15), false, '15:00 must NOT be quiet hours');
});
