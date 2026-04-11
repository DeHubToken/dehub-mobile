---
applyTo: "**/*.tsx"
---
# Project Code Generation Guidelines

## Styling
- Use React Native and Tailwind (`className`) via NativeWind for styling.
- Always use Tailwind classes.
- Prefer Tailwind (`className`) for consistency and maintainability.
- Avoid style duplication — extract shared styles into reusable components.
- Check docs/icon-inventory.md for icons to use

## Icons
- **Always** use the `<Icon>` wrapper from `components/ui/Icon.tsx`.
- Import: `import Icon from '@/components/ui/Icon'` (or relative path).
- The `name` prop accepts any `lucide-react-native` icon name (e.g. `"ChevronLeft"`, `"Heart"`, `"Send"`).
- For gradient icons, pass a `gradient` prop with an array of color stops instead of `color`.
- **Never** import from `@expo/vector-icons` (Ionicons, MaterialIcons, FontAwesome, etc.) in new or modified files.
- **Never** import directly from `lucide-react-native` — always go through the `<Icon>` wrapper.
- Refer to `docs/icon-inventory.md` for the full list of available icon names and custom PNG assets.

## Component Structure
- Use functional components with arrow function syntax.
- Always define explicit TypeScript types — no implicit `any`.
- Group code logically: props → hooks → handlers → return JSX.
- Avoid large monolithic components. Break complex screens into smaller, modular, reusable components.
- Wrap presentational components with `React.memo` to prevent re-renders from parent state changes.
- Use `SafeAreaView` and `KeyboardAvoidingView` where appropriate the app is already wrapped in `SafeAreaView`.
- Hoist static data (menu items, config arrays, constants) outside component bodies — never recreate unchanging objects on every render.

## Navigation & Overlays
- The app uses a `DrawerContext` (`context/DrawerContext.tsx`) for the side drawer. Call `useDrawer()` to open/close the drawer from any tab screen.
- The `AppDrawer` renders at the `BottomTabNavigator` level (above the tab bar). Never render full-screen overlays inside individual tab screens — they will be clipped by the tab bar.
- Use `Gesture.Pan()` from `react-native-gesture-handler` for swipeable UI (drawers, bottom sheets, dismissible cards). Drive animations from gesture events on the UI thread via Reanimated shared values.

## Performance Optimization
- Use `useCallback` and `useMemo` to prevent unnecessary re-renders — but only when a function/value is passed to a memoized child or used in a dep array.
- Avoid anonymous functions in JSX (e.g., `onPress={() => doSomething()}`).
- Use `FlatList` or `SectionList` instead of `ScrollView` for rendering long/dynamic lists.
- Use dynamic imports and React.lazy for code splitting.
- Memoize context values with `useMemo` to prevent full-tree re-renders on context change.
- Extract inline callbacks from JSX into named `useCallback` handlers.

## Memory Management
- Always clean up event listeners and subscriptions in `useEffect`
- Avoid calling `setState` on unmounted components.

## Architecture & Reusability
- Embrace modular architecture: separate logic, presentation, and services.
- Keep components lean by extracting business logic into hooks or services.

## API Consumption
- Centralize API logic in a general `api.ts` file using Axios or Fetch.
- Create service files for specific domains (e.g., `auth.service.ts`, `user.service.ts`) that use the general `api.ts` instance.
- Use proper error handling and async/await syntax.
- Log the errors
- Define API response types and DTOs using TypeScript.
- Use optimistic updates and error handling to improve user experience.
- Use SWR or React Query for caching, pagination, and background fetching.

## WebSocket Best Practices
- Use a centralized WebSocket utility or service.
- Handle reconnections and error states gracefully.
- Clean up sockets and listeners in component unmount.
- Use context or event emitters to share socket data across components.

## Animations
- Use `react-native-reanimated` for all animations (shared values, `useAnimatedStyle`, `withTiming`, `withSpring`).
- Never use the built-in `Animated` API from React Native for new code.
- Prefer `withTiming` with custom `Easing` curves for UI transitions (drawers, modals, slide-ins).
- Use `withSpring` for bouncy / interactive gestures.
- Keep animated values as `useSharedValue` — avoid storing animation state in React state.

## Miscellaneous
- Don't write comments that just explains stuff like an AI would. Limit commenting to non-obvious logic, assumptions, and important notes for future maintainers.
- **Never** add decorative comment banners or section separators (e.g. `/* ----- Types ----- */`, `/* ======= */`, `// ---- animation ----`).
- **Never** add JSX comments that just restate what the element is (e.g. `{/* Animated drawer panel */}`, `{/* Divider */}`).
- **Never** add JSDoc/multiline comment blocks that just describe what a component, screen, hook, or function does (e.g. `/** UserReplyCard – Renders a single comment/reply... */`, `/** SignInScreen - Handles user authentication */`). The name should be self-explanatory. Only use JSDoc when documenting non-obvious behavior, caveats, or complex parameters.
- Comments should explain *why*, not *what*. If the code is self-explanatory, don't comment it.