---
applyTo: "**/*.tsx"
---
# Project Code Generation Guidelines

## Styling
- Use React Native and Tailwind (`className`) via NativeWind for styling.
- Always use Tailwind classes.
- Prefer Tailwind (`className`) for consistency and maintainability.
- Avoid style duplication — extract shared styles into reusable components.

## Component Structure
- Use functional components with arrow function syntax.
- Always define explicit TypeScript types — no implicit `any`.
- Group code logically: props → hooks → handlers → return JSX.
- Avoid large monolithic components. Break complex screens into smaller, modular, reusable components.
- Use `SafeAreaView` and `KeyboardAvoidingView` where appropriate the app is already wrapped in `SafeAreaView`.

## Performance Optimization
- Use `useCallback` and `useMemo` to prevent unnecessary re-renders.
- Avoid anonymous functions in JSX (e.g., `onPress={() => doSomething()}`).
- Use `FlatList` or `SectionList` instead of `ScrollView` for rendering long/dynamic lists.
- Use dynamic imports and React.lazy for code splitting

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
