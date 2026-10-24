const browserPbkdf2 = require('pbkdf2/lib/sync');
const { pbkdf2Sync } = require('node:crypto');

describe('PBKDF2 derivation compatibility', () => {
  it('preserves the RFC 6070 SHA-1 vector', () => {
    expect(browserPbkdf2('password', 'salt', 2, 20, 'sha1').toString('hex'))
      .toBe('ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957');
  });

  for (const digest of ['sha256', 'sha512']) {
    for (const password of ['ordinary password', 'long password '.repeat(100), 'pass\0word']) {
      it(`matches native ${digest} derivation for a ${password.length}-character password`, () => {
        const salt = Buffer.from('73616c740074657374', 'hex');
        expect(browserPbkdf2(password, salt, 4096, 64, digest).toString('hex'))
          .toBe(pbkdf2Sync(password, salt, 4096, 64, digest).toString('hex'));
      });
    }
  }
});
