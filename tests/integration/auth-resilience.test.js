/**
 * Auth resilience tests (PR2): singleflight refresh, recovery, proactive sweep,
 * permanent-vs-transient classification, and the channel recovery hook.
 *
 * Drives the auth-manager singleton with an injected fake auth provider and a
 * mocked repo/alert layer, so the new logic is exercised without real twurple
 * or a database.
 */

jest.mock('../../src/database/repositories/auth-repo', () => ({
  getBotAuthWithTwitchId: jest.fn(),
  getAllChannelAuthsWithTwitchId: jest.fn(() => []),
  updateBotAuth: jest.fn(),
  updateChannelAuthByTwitchId: jest.fn()
}));
jest.mock('../../src/utils/alert', () => ({
  sendAlert: jest.fn(),
  clearAlert: jest.fn(),
  _resetAlerts: jest.fn()
}));

const authRepo = require('../../src/database/repositories/auth-repo');
const { sendAlert } = require('../../src/utils/alert');
const { CachedRefreshFailureError } = require('@twurple/auth');
const authManager = require('../../src/bot/auth-manager');

const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();

function botRow(expiresMs = 3600e3) {
  return {
    twitch_user_id: 'bot1',
    bot_username: 'bot',
    access_token: 'a',
    refresh_token: 'r',
    scopes: [],
    expires_at: iso(expiresMs),
    updated_at: new Date().toISOString()
  };
}
function channelRow(id = 'chan1', expiresMs = 3600e3) {
  return {
    channel_id: 1,
    twitch_user_id: id,
    channel_twitch_id: id,
    access_token: 'a',
    refresh_token: 'r',
    scopes: '',
    expires_at: iso(expiresMs),
    updated_at: new Date().toISOString()
  };
}

let fakeProvider;
beforeEach(() => {
  jest.clearAllMocks();
  fakeProvider = {
    addUser: jest.fn(),
    refreshAccessTokenForUser: jest.fn().mockResolvedValue({ accessToken: 'new' })
  };
  authManager.authProvider = fakeProvider;
  authManager.botTwitchId = 'bot1';
  authManager.botUsername = 'bot';
  authManager.channelTwitchIds = new Set();
  authManager._authHealth.clear();
  authManager._refreshInFlight.clear();
  authManager._pendingRetries.clear();
  authManager._onChannelRecovered = null;
  authRepo.getBotAuthWithTwitchId.mockReturnValue(botRow());
  authRepo.getAllChannelAuthsWithTwitchId.mockReturnValue([]);
});

afterEach(() => {
  for (const t of authManager._pendingRetries.values()) clearTimeout(t);
  authManager._pendingRetries.clear();
});

describe('singleflight refresh (_refreshUserOnce)', () => {
  it('collapses concurrent refreshes for the same user into one', async () => {
    fakeProvider.refreshAccessTokenForUser.mockImplementation(
      () => new Promise((res) => setTimeout(() => res({ accessToken: 'x' }), 20))
    );
    const [a, b] = await Promise.all([
      authManager._refreshUserOnce('bot1'),
      authManager._refreshUserOnce('bot1')
    ]);
    expect(fakeProvider.refreshAccessTokenForUser).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('allows a fresh refresh after the previous settles', async () => {
    await authManager._refreshUserOnce('bot1');
    await authManager._refreshUserOnce('bot1');
    expect(fakeProvider.refreshAccessTokenForUser).toHaveBeenCalledTimes(2);
  });
});

describe('recoverUser', () => {
  it('re-adds from DB and force-refreshes the bot', async () => {
    const ok = await authManager.recoverUser('bot1');
    expect(ok).toBe(true);
    expect(fakeProvider.addUser).toHaveBeenCalled(); // _reAddUserFromDb
    expect(fakeProvider.refreshAccessTokenForUser).toHaveBeenCalledWith('bot1');
  });

  it('fires the recovery hook for a channel user (EventSub resub)', async () => {
    authManager.channelTwitchIds = new Set(['chan1']);
    authRepo.getAllChannelAuthsWithTwitchId.mockReturnValue([channelRow('chan1')]);
    const hook = jest.fn().mockResolvedValue(undefined);
    authManager.setRecoveryHook(hook);

    const ok = await authManager.recoverUser('chan1');
    expect(ok).toBe(true);
    expect(hook).toHaveBeenCalledWith('chan1');
  });

  it('returns false when the refresh throws', async () => {
    fakeProvider.refreshAccessTokenForUser.mockRejectedValue(new Error('boom'));
    const ok = await authManager.recoverUser('bot1');
    expect(ok).toBe(false);
  });
});

describe('permanent vs transient classification', () => {
  it('flags revoked/invalid_grant/cached-failure as permanent', () => {
    expect(authManager._isPermanentAuthFailure(new CachedRefreshFailureError('bot1'))).toBe(true);
    expect(authManager._isPermanentAuthFailure(new Error('invalid_grant'))).toBe(true);
    expect(authManager._isPermanentAuthFailure(new Error('token was revoked'))).toBe(true);
  });

  it('treats network/5xx errors as transient', () => {
    expect(authManager._isPermanentAuthFailure(new Error('socket timeout'))).toBe(false);
    expect(authManager._isPermanentAuthFailure(new Error('500 Internal Server Error'))).toBe(false);
  });

  it('permanent failure alerts immediately and schedules NO retry', () => {
    authManager._handleRefreshFailure('bot1', new Error('invalid_grant'));
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(authManager._pendingRetries.has('bot1')).toBe(false);
    const health = authManager.getAuthHealth().find((h) => h.userId === 'bot1');
    expect(health.state).toBe('permanent_failure');
  });

  it('transient failure schedules a retry and does not alert', () => {
    authManager._handleRefreshFailure('bot1', new Error('socket timeout'));
    expect(sendAlert).not.toHaveBeenCalled();
    expect(authManager._pendingRetries.has('bot1')).toBe(true);
    const health = authManager.getAuthHealth().find((h) => h.userId === 'bot1');
    expect(health.state).toBe('transient_failure');
  });
});

describe('proactive sweep (_sweepTokens)', () => {
  it('refreshes a token near expiry and skips one far from expiry', async () => {
    authManager.channelTwitchIds = new Set(['chanFar']);
    authRepo.getBotAuthWithTwitchId.mockReturnValue(botRow(5 * 60 * 1000)); // 5 min -> refresh
    authRepo.getAllChannelAuthsWithTwitchId.mockReturnValue([channelRow('chanFar', 60 * 60 * 1000)]); // 1h -> skip

    await authManager._sweepTokens();

    expect(fakeProvider.refreshAccessTokenForUser).toHaveBeenCalledWith('bot1');
    expect(fakeProvider.refreshAccessTokenForUser).not.toHaveBeenCalledWith('chanFar');
  });

  it('skips a user with a pending retry (no double refresh)', async () => {
    authRepo.getBotAuthWithTwitchId.mockReturnValue(botRow(60 * 1000)); // near expiry
    authManager._pendingRetries.set('bot1', setTimeout(() => {}, 10000));

    await authManager._sweepTokens();

    expect(fakeProvider.refreshAccessTokenForUser).not.toHaveBeenCalled();
  });
});
