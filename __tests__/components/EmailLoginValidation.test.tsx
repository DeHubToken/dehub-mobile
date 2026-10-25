import React from 'react';
import { act, create } from 'react-test-renderer';
import EmailLoginFlow from '../../components/auth/EmailLoginFlow';

const mockFocus = jest.fn();
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../hooks/useSurfaceDraft', () => ({
  useSurfaceDraft: (_key: string, initial: string) => require('react').useState(initial),
}));
jest.mock('../../components/auth/AuthControls', () => {
  const { createElement: element, forwardRef, useImperativeHandle } = require('react');
  return {
    AuthButton: (props: object) => element('Button', props),
    AuthErrorNotice: (props: object) => element('Error', props),
    AuthField: forwardRef((props: object, ref: unknown) => {
      useImperativeHandle(ref, () => ({ focus: mockFocus }));
      return element('Field', props);
    }),
  };
});

it('prompts and focuses an empty email before allowing a valid address to submit', () => {
  const submit = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<EmailLoginFlow startOpen onSubmit={submit} />); });
  const button = () => tree.root.findByType('Button' as any);
  expect(button().props.disabled).toBeFalsy();
  act(() => button().props.onPress());
  expect(tree.root.findByType('Error' as any).props.message).toBe('loginModal.emailPlaceholder');
  expect(mockFocus).toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  act(() => tree.root.findByType('Field' as any).props.onChangeText('not-an-email'));
  act(() => button().props.onPress());
  expect(tree.root.findByType('Error' as any).props.message).toBe('loginModal.invalidEmail');
  expect(submit).not.toHaveBeenCalled();
  act(() => tree.root.findByType('Field' as any).props.onChangeText(' person@example.com '));
  act(() => button().props.onPress());
  expect(submit).toHaveBeenCalledWith('email_passwordless', 'person@example.com');
  act(() => tree.unmount());
});
