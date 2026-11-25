import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes with scrypt and verifies the password', async () => {
    const hash = await hashPassword('Passw0rd!');
    expect(hash.startsWith('scrypt$32768$8$3$')).toBe(true);
    await expect(verifyPassword('Passw0rd!', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$bad$8$3$salt$hash')).resolves.toBe(false);
  });
});
