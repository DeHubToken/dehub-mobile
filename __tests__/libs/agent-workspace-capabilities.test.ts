import { workspaceAvailable } from '../../libs/agent-workspace';

describe('workspace backend compatibility', () => {
  it.each([undefined, null, {}, { workspace: false, version: 1 }, { workspace: true }, { workspace: 'true', version: 1 }, { workspace: true, version: 2 }])('keeps controls off for an absent or unsupported capability: %j', (value) => {
    expect(workspaceAvailable(value)).toBe(false);
  });

  it('activates controls only for the supported migrated backend', () => {
    expect(workspaceAvailable({ workspace: true, version: 1 })).toBe(true);
  });
});
