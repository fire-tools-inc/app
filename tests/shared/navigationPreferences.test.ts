import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptData, decryptData } from '../../src/utils/cookieEncryption';
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../../src/utils/navigationPreferences';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), error: vi.fn() }));
vi.mock('../../src/utils/safeCookies', () => ({ default: { get: mocks.get, set: mocks.set } }));
vi.mock('../../src/utils/logger', () => ({ logger: { error: mocks.error } }));

beforeEach(() => {
  mocks.get.mockReset().mockReturnValue(undefined);
  mocks.set.mockReset();
  mocks.error.mockReset();
});

describe('Sidebar preference', () => {
  it('starts expanded when no preference was saved', () => {
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it('round trips both states through encrypted SafeCookies storage', () => {
    for (const collapsed of [true, false]) {
      saveSidebarCollapsed(collapsed);
      const encrypted = mocks.set.mock.lastCall?.[1];
      expect(JSON.parse(decryptData(encrypted)!)).toEqual({ collapsed });
      mocks.get.mockReturnValue(encrypted);
      expect(loadSidebarCollapsed()).toBe(collapsed);
    }
    expect(mocks.set.mock.lastCall?.[2]).toEqual(expect.objectContaining({ sameSite: 'strict', path: '/', expires: 365 }));
  });

  it.each(['invalid ciphertext', encryptData('{"collapsed":"true"}'), encryptData('null')])(
    'logs malformed saved data rather than accepting a truthy value: %s',
    value => {
      mocks.get.mockReturnValue(value);
      expect(loadSidebarCollapsed()).toBe(false);
      expect(mocks.error).toHaveBeenCalledWith('navigation-preferences', 'load-failed', expect.any(String), expect.any(Object));
    },
  );

  it('logs blocked reads and writes while leaving the UI preference optional', () => {
    mocks.get.mockImplementation(() => { throw new Error('synthetic read failure'); });
    expect(loadSidebarCollapsed()).toBe(false);
    mocks.set.mockImplementation(() => { throw new Error('synthetic write failure'); });
    expect(() => saveSidebarCollapsed(true)).not.toThrow();
    expect(mocks.error).toHaveBeenCalledTimes(2);
  });
});
