const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the installed patch, including the CommonJS entry Metro can resolve.
const packageRoot = process.env.WALLET_PICKER_PACKAGE || path.join(__dirname, '../node_modules/@reown/appkit-scaffold-react-native');
function render({ height = 800, top = 32, bottom = 24, keyboard = false, keyboardTop = 520, history = [1] } = {}) {
  let closed = 0;
  let backed = 0;
  let dismissed = 0;
  const controller = {
    ModalController: { state: { open: true }, close: () => closed++ },
    ConnectorController: { state: { connectors: [] } },
    AccountController: { state: {} },
    ThemeController: { state: {} },
    RouterController: { state: { history }, goBack: () => backed++ },
  };
  const react = {
    useCallback: fn => fn,
    useEffect: () => {},
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  };
  const modules = {
    react,
    valtio: { useSnapshot: state => state },
    'react-native': { useWindowDimensions: () => ({ height }), Platform: { OS: 'android' }, View: 'View', Keyboard: { dismiss: () => dismissed++ } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top, bottom }) },
    'react-native-modal': 'Modal',
    '@reown/appkit-ui-react-native': { Card: 'Card', ThemeProvider: 'ThemeProvider' },
    '@reown/appkit-core-react-native': controller,
    '@reown/appkit-siwe-react-native': {},
    '../../hooks/useKeyboard': { useKeyboard: () => ({ keyboardShown: keyboard, coordinates: { end: { screenY: keyboardTop } } }) },
    '../w3m-router': { AppKitRouter: 'Router' },
    '../../partials/w3m-header': { Header: 'Header' },
    '../../partials/w3m-snackbar': { Snackbar: 'Snackbar' },
    './styles': { modal: {}, card: {} },
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(packageRoot, 'lib/commonjs/modal/w3m-modal/index.js'), 'utf8'), {
    exports, React: react,
    require: id => {
      assert.ok(id in modules, `Unexpected dependency: ${id}`);
      return modules[id];
    },
  });
  const tree = exports.AppKit();
  function find(type, node = tree) {
    if (!node || typeof node !== 'object') return;
    if (node.type === type) return node;
    for (const child of node.children || []) {
      const found = find(type, child);
      if (found) return found;
    }
  }
  return { find, counts: () => ({ closed, backed, dismissed }) };
}

test('picker reserves the gesture inset inside its capped card', () => {
  const { find } = render();
  assert.equal(find('Card').props.style[1].maxHeight, 760);
  assert.equal(find('View').props.style.height, 24);
  assert.equal(find('Modal').props.style[1].paddingBottom, 0);
});

test('search keyboard lifts and shortens the same card without doubling the inset', () => {
  const { find } = render({ keyboard: true });
  assert.equal(find('Modal').props.style[1].paddingBottom, 280);
  assert.equal(find('Card').props.style[1].maxHeight, 480);
  assert.equal(find('View').props.style.height, 0);
});

test('an already resized Android window does not subtract keyboard height twice', () => {
  const { find } = render({ height: 520, keyboard: true });
  assert.equal(find('Modal').props.style[1].paddingBottom, 0);
  assert.equal(find('Card').props.style[1].maxHeight, 480);
});

test('Android Back closes the first screen and navigates back from search or QR', () => {
  const root = render();
  root.find('Modal').props.onBackButtonPress();
  assert.deepEqual(root.counts(), { closed: 1, backed: 0, dismissed: 1 });
  const nested = render({ history: [1, 2] });
  nested.find('Modal').props.onBackButtonPress();
  assert.deepEqual(nested.counts(), { closed: 0, backed: 1, dismissed: 0 });
});
