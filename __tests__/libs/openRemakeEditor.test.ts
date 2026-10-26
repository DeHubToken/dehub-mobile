import { StackActions, StackRouter } from '@react-navigation/routers';
import { openRemakeEditor } from '../../libs/openRemakeEditor';
import { ScreenNames } from '../../navigation/ScreenNames';

it('keeps an existing editor project and mounts a fresh route for the saved Remake', () => {
  const router = StackRouter({ initialRouteName: ScreenNames.MediaEditor });
  const options = { routeNames: [ScreenNames.MediaEditor, ScreenNames.CreatorRemake], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  const existingKey = state.routes[0].key;
  state = router.getRehydratedState(router.getStateForAction(state, StackActions.push(ScreenNames.CreatorRemake), options)!, options);
  const source = { url: 'https://private.test/fresh-link', kind: 'video' as const, name: 'Saved Remake' };
  const push = jest.fn((name, params) => {
    state = router.getRehydratedState(router.getStateForAction(state, StackActions.push(name, params), options)!, options);
  });
  openRemakeEditor({ push } as Parameters<typeof openRemakeEditor>[0], source);
  expect(state.routes).toHaveLength(3);
  expect(state.routes[0].key).toBe(existingKey);
  expect(state.routes[2].name).toBe(ScreenNames.MediaEditor);
  expect(state.routes[2].key).not.toBe(existingKey);
  expect(state.routes[2].params).toEqual({ importMedia: source });
});
