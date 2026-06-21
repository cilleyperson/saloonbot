/**
 * ChannelManager chat-membership health + rejoin tests (PR1: T0 + T5b)
 *
 * Covers the "connected but absent from chat" reconnect bug: the bot holds a
 * valid connection but is joined to zero channels because a reconnect didn't
 * rejoin. getMembershipHealth() must surface that drift; rejoinMissing() must
 * repair it.
 */

// Mock the repos/auth-manager channel-manager imports so requiring it doesn't
// touch the database. The methods under test only use joinedChats + chatClient.
jest.mock('../../src/database/repositories/channel-repo', () => ({}));
jest.mock('../../src/database/repositories/settings-repo', () => ({}));
jest.mock('../../src/database/repositories/chat-membership-repo', () => ({
  getAllActiveTargetChannels: () => []
}));
jest.mock('../../src/bot/auth-manager', () => ({}));

const ChannelManager = require('../../src/bot/channel-manager');

function makeChatClient(currentChannels, connected = true) {
  return {
    currentChannels,
    isConnected: connected,
    join: jest.fn().mockResolvedValue(undefined),
    part: jest.fn().mockResolvedValue(undefined)
  };
}

describe('ChannelManager.getMembershipHealth', () => {
  it('reports healthy when actual matches expected', () => {
    const cm = new ChannelManager();
    cm.setDependencies(makeChatClient(['#alice', '#bob']), null, null);
    cm.joinedChats.add('alice');
    cm.joinedChats.add('bob');

    const h = cm.getMembershipHealth();
    expect(h.healthy).toBe(true);
    expect(h.expectedCount).toBe(2);
    expect(h.joinedCount).toBe(2);
    expect(h.missing).toEqual([]);
    expect(h.connected).toBe(true);
  });

  it('detects the rejoin bug: connected but joined to zero channels', () => {
    const cm = new ChannelManager();
    cm.setDependencies(makeChatClient([], true), null, null);
    cm.joinedChats.add('alice');
    cm.joinedChats.add('bob');

    const h = cm.getMembershipHealth();
    expect(h.healthy).toBe(false);
    expect(h.joinedCount).toBe(0);
    expect(h.missing).toEqual(['alice', 'bob']);
    expect(h.connected).toBe(true); // the dangerous part: looks connected
  });

  it('normalizes leading # and case when comparing', () => {
    const cm = new ChannelManager();
    cm.setDependencies(makeChatClient(['#ALICE']), null, null);
    cm.joinedChats.add('alice');
    cm.joinedChats.add('bob');

    const h = cm.getMembershipHealth();
    expect(h.missing).toEqual(['bob']);
  });

  it('flags extra channels joined that were not expected', () => {
    const cm = new ChannelManager();
    cm.setDependencies(makeChatClient(['#alice', '#carol']), null, null);
    cm.joinedChats.add('alice');

    const h = cm.getMembershipHealth();
    expect(h.extra).toEqual(['carol']);
  });

  it('handles a null chat client', () => {
    const cm = new ChannelManager();
    const h = cm.getMembershipHealth();
    expect(h.joinedCount).toBe(0);
    expect(h.connected).toBeNull();
    expect(h.healthy).toBe(true); // no expected, no missing
  });
});

describe('ChannelManager.rejoinMissing', () => {
  it('rejoins only the missing channels', async () => {
    const cm = new ChannelManager();
    const chat = makeChatClient([]); // joined nothing after reconnect
    cm.setDependencies(chat, null, null);
    cm.joinedChats.add('alice');
    cm.joinedChats.add('bob');

    const rejoined = await cm.rejoinMissing();
    expect(rejoined.sort()).toEqual(['alice', 'bob']);
    expect(chat.join).toHaveBeenCalledWith('alice');
    expect(chat.join).toHaveBeenCalledWith('bob');
  });

  it('is a no-op when membership is healthy', async () => {
    const cm = new ChannelManager();
    const chat = makeChatClient(['#alice']);
    cm.setDependencies(chat, null, null);
    cm.joinedChats.add('alice');

    const rejoined = await cm.rejoinMissing();
    expect(rejoined).toEqual([]);
    expect(chat.join).not.toHaveBeenCalled();
  });

  it('continues past a failing join and reports only successes', async () => {
    const cm = new ChannelManager();
    const chat = makeChatClient([]);
    chat.join = jest.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    cm.setDependencies(chat, null, null);
    cm.joinedChats.add('alice');
    cm.joinedChats.add('bob');

    const rejoined = await cm.rejoinMissing();
    expect(rejoined.length).toBe(1);
    expect(chat.join).toHaveBeenCalledTimes(2);
  });
});
