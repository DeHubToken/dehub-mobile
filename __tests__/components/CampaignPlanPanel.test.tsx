import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

const mockDisk: Record<string, string> = {};
jest.mock('../../libs/storage', () => ({ storage: { getString: (key: string) => mockDisk[key], set: (key: string, value: string) => { mockDisk[key] = value; }, delete: (key: string) => { delete mockDisk[key]; } } }));
let mockDraftUser: { address: string } | null = { address: 'alice' };
jest.mock('../../context/AuthContext', () => ({ useUser: () => mockDraftUser }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { CampaignPlanPanel } from '../../components/Assistant/CampaignPlanPanel';
import { EMPTY_MARKETING_BRIEF } from '../../libs/marketingBrief';
import { __resetDraftCacheForTests, flushDrafts } from '../../libs/draft-cache';

beforeEach(() => { mockDraftUser = { address: 'alice' }; for (const key of Object.keys(mockDisk)) delete mockDisk[key]; __resetDraftCacheForTests(); });
afterEach(cleanup);
it('prepares only the selected reviewed variant and restores account-scoped plans after reopen', () => {
  const prepare = jest.fn(), brief = { ...EMPTY_MARKETING_BRIEF, product: 'Tea', description: 'Whole leaves in a tin' };
  const tree = () => <CampaignPlanPanel brief={brief} onPrepare={prepare} />;
  const ui = render(tree());
  fireEvent.changeText(ui.getByLabelText('creator.campaignTitle'), 'Daily rituals');
  fireEvent.press(ui.getByText('creator.campaignAdd'));
  fireEvent.changeText(ui.getByLabelText('creator.marketing.fields.headline'), 'Make time');
  fireEvent.changeText(ui.getByLabelText('creator.campaignLanguage'), 'Spanish');
  expect(prepare).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('creator.marketing.open'));
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ kind: 'image', aspect: '1:1', prompt: expect.stringContaining('Approved headline: "Make time"') }));
  mockDraftUser = { address: 'bob' }; ui.rerender(tree());
  expect(ui.getByLabelText('creator.campaignTitle').props.value).toBe('');
  expect(ui.queryByText('creator.marketing.open')).toBeNull();
  mockDraftUser = { address: 'alice' }; ui.rerender(tree());
  expect(ui.getByLabelText('creator.marketing.fields.headline').props.value).toBe('Make time');
  flushDrafts(); ui.unmount();
  const restored = render(tree());
  expect(restored.getByLabelText('creator.campaignTitle').props.value).toBe('Daily rituals');
  fireEvent.press(restored.getByText('creator.campaignClear'));
  expect(restored.queryByText('creator.marketing.open')).toBeNull();
});
