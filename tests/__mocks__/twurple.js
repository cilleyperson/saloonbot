/**
 * Mock for Twurple packages.
 *
 * Models enough of the real surface that resilience tests exercise true
 * semantics rather than a stub: RefreshingAuthProvider exposes the refresh +
 * failure callbacks and refreshAccessTokenForUser; ChatClient exposes
 * reconnect/currentChannels/isConnected and the auth-failure callback.
 */

// @twurple/api
class ApiClient {
  constructor() {}
  users = {
    getUserByName: jest.fn().mockResolvedValue(null),
    getUserById: jest.fn().mockResolvedValue(null),
  };
  channels = {
    getChannelInfoById: jest.fn().mockResolvedValue(null),
  };
}

// @twurple/auth
class RefreshingAuthProvider {
  constructor() {
    this._onRefresh = null;
    this._onRefreshFailure = null;
  }
  addUser = jest.fn();
  addIntentsToUser = jest.fn();
  removeUser = jest.fn();
  getAccessTokenForUser = jest.fn().mockResolvedValue(null);
  refreshAccessTokenForUser = jest.fn().mockResolvedValue({ accessToken: 'new', refreshToken: 'new', expiresIn: 3600 });
  onRefresh = jest.fn(function (cb) { this._onRefresh = cb; });
  onRefreshFailure = jest.fn(function (cb) { this._onRefreshFailure = cb; });
}

class StaticAuthProvider {
  constructor() {}
}

// twurple caches refresh failures and disables the user until re-added.
class CachedRefreshFailureError extends Error {
  constructor(userId) {
    super(`Cached refresh failure for user ${userId}`);
    this.name = 'CachedRefreshFailureError';
  }
}

// @twurple/chat
class ChatClient {
  constructor() {
    this._channels = [];
    this._connected = false;
  }
  connect = jest.fn().mockResolvedValue();
  disconnect = jest.fn().mockResolvedValue();
  quit = jest.fn().mockResolvedValue();
  reconnect = jest.fn().mockResolvedValue();
  join = jest.fn(function (channel) { if (!this._channels.includes(channel)) this._channels.push(channel); return Promise.resolve(); });
  part = jest.fn().mockResolvedValue();
  say = jest.fn().mockResolvedValue();
  onMessage = jest.fn();
  onConnect = jest.fn();
  onDisconnect = jest.fn();
  onJoin = jest.fn();
  onPart = jest.fn();
  onAuthenticationFailure = jest.fn();
  get currentChannels() { return this._channels; }
  get isConnected() { return this._connected; }
  get currentNick() { return 'mockbot'; }
}

// @twurple/eventsub-ws
class EventSubWsListener {
  constructor() {}
  start = jest.fn().mockResolvedValue();
  stop = jest.fn().mockResolvedValue();
  onChannelFollow = jest.fn(() => ({ stop: jest.fn() }));
  onChannelSubscription = jest.fn(() => ({ stop: jest.fn() }));
  onChannelSubscriptionMessage = jest.fn(() => ({ stop: jest.fn() }));
  onChannelSubscriptionGift = jest.fn(() => ({ stop: jest.fn() }));
  onChannelRaidTo = jest.fn(() => ({ stop: jest.fn() }));
  onSubscriptionCreateFailure = jest.fn();
}

module.exports = {
  // @twurple/api
  ApiClient,

  // @twurple/auth
  RefreshingAuthProvider,
  StaticAuthProvider,
  CachedRefreshFailureError,

  // @twurple/chat
  ChatClient,

  // @twurple/eventsub-ws
  EventSubWsListener,
};
