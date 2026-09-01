import {
  liveUploadErrorMessage,
  MINT_STAGES,
} from '../../libs/live-upload-error';

describe('libs/live-upload-error', () => {
  it('reads a locked wallet as a locked wallet once the wallet has the launch', () => {
    const locked = Object.assign(new Error('Your wallet is locked. Unlock it to continue.'), {
      name: 'WalletLockedError',
    });

    for (const stage of MINT_STAGES) {
      expect(liveUploadErrorMessage(stage, locked)).toBe(
        'Your wallet is locked — unlock it to continue',
      );
    }
  });

  it('says the creator rejected the transaction rather than printing the dump', () => {
    const rejected = Object.assign(
      new Error('user rejected action (action="sendTransaction", code=ACTION_REJECTED, version=6.13.2)'),
      { code: 'ACTION_REJECTED' },
    );

    expect(liveUploadErrorMessage('awaiting-wallet', rejected)).toBe(
      'You rejected the transaction',
    );
  });

  // The regression this exists for: the stage was read off a useCallback
  // closure that never advanced past "idle", so every wallet failure fell into
  // the raw branch and the creator was shown the ethers dump.
  it('does not treat a wallet failure as an upload failure', () => {
    const rejected = Object.assign(new Error('user rejected'), { code: 4001 });

    expect(liveUploadErrorMessage('minting', rejected)).not.toBe('user rejected');
  });

  it('keeps the thrown message before the wallet is involved', () => {
    expect(
      liveUploadErrorMessage('processing', new Error('Mint payload missing a token id')),
    ).toBe('Mint payload missing a token id');
    expect(liveUploadErrorMessage('uploading', new Error('Upload failed'))).toBe(
      'Upload failed',
    );
  });

  it('falls back when whatever was thrown carries no message', () => {
    expect(liveUploadErrorMessage('idle', {})).toBe('Livestream creation failed');
    expect(liveUploadErrorMessage('idle', null)).toBe('Livestream creation failed');
  });
});
