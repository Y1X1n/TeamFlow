import { isPrivateAddress } from './ip';

describe('isPrivateAddress', () => {
  it('accepts loopback and private IPv4 ranges', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('192.168.1.10')).toBe(true);
    expect(isPrivateAddress('172.16.0.4')).toBe(true);
    expect(isPrivateAddress('172.31.255.1')).toBe(true);
  });

  it('rejects public addresses and empty values', () => {
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('203.0.113.5')).toBe(false);
    expect(isPrivateAddress(undefined)).toBe(false);
  });
});
