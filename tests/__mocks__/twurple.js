/**
 * Mock for Twurple packages
 *
 * This mock provides stub implementations for all Twurple packages
 * to allow testing without the actual Twitch API integration.
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
  constructor() {}
  addUser = jest.fn();
  removeUser = jest.fn();
  getAccessTokenForUser = jest.fn().mockResolvedValue(null);
  onRefresh = jest.fn();
}

class StaticAuthProvider {
  constructor() {}
}

// @twurple/chat
class ChatClient {
  constructor() {}
  connect = jest.fn().mockResolvedValue();
  disconnect = jest.fn().mockResolvedValue();
  join = jest.fn().mockResolvedValue();
  part = jest.fn().mockResolvedValue();
  say = jest.fn().mockResolvedValue();
  onMessage = jest.fn();
  onConnect = jest.fn();
  onDisconnect = jest.fn();
}

// @twurple/eventsub-ws
class EventSubWsListener {
  constructor() {}
  start = jest.fn().mockResolvedValue();
  stop = jest.fn().mockResolvedValue();
  onChannelFollow = jest.fn();
  onChannelSubscription = jest.fn();
  onChannelRaidTo = jest.fn();
}

module.exports = {
  // @twurple/api
  ApiClient,

  // @twurple/auth
  RefreshingAuthProvider,
  StaticAuthProvider,

  // @twurple/chat
  ChatClient,

  // @twurple/eventsub-ws
  EventSubWsListener,
};
