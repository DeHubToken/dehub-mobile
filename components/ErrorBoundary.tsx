import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import i18n from 'i18next';
import { colors } from '../theme/colors';
import PrimaryButton from './ui/PrimaryButton';
import { createLogger } from '../libs/logger';
import { queryClient } from '../config/queryClient';
import { dropPersistedQueryCache, restartApp } from '../libs/crashRecovery';

const logger = createLogger('ErrorBoundary');

/**
 * Two faults inside this window count as a loop: whatever threw is not going
 * to stop throwing because the tree was rebuilt once more.
 */
const LOOP_WINDOW_MS = 15_000;
const LOOP_THRESHOLD = 2;

interface Props {
  children: ReactNode;
  /** Optional fallback component */
  fallback?: ReactNode;
  /** A fallback that can ask for another attempt. Wins over `fallback`. */
  renderFallback?: (retry: () => void) => ReactNode;
  /** Called when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show error details (dev only) */
  showDetails?: boolean;
  /** Where in the app this boundary sits — lands in the log row. */
  scope?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * i18next through the singleton, not `useTranslation`: this is a class, and
 * it must render even if the fault it caught was in i18n's own provider.
 * The literal is the floor for the moment before i18next has initialised,
 * when `t` returns nothing at all.
 */
function tr(key: string, fallback: string): string {
  try {
    const value = i18n.t(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

export class ErrorBoundary extends Component<Props, State> {
  private faults: number[] = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // The Error itself, not a flattened copy of it: the reporter reads the
    // stack off an Error into its own column, where a stringified one would
    // sit in metadata and be truncated with everything else.
    logger.error('Uncaught error in component tree', error, {
      scope: this.props.scope ?? 'app',
      componentStack: errorInfo.componentStack?.slice(0, 1500),
    });

    // Whatever was restored from disk is now suspect — a poisoned cache entry
    // is exactly the kind of fault that comes back on every launch. The
    // network has the truth; the next start fetches it.
    dropPersistedQueryCache();

    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // logger.error above ships this to client_error_logs via libs/errorReporter,
    // so a render crash on a tester's phone is readable. Native crashes (an
    // OutOfMemoryError, an ExoPlayer fault) still need Crashlytics — the JS
    // thread never hears about those.

    const now = Date.now();
    this.faults = this.faults.filter((t) => now - t < LOOP_WINDOW_MS);
    this.faults.push(now);
    if (this.faults.length >= LOOP_THRESHOLD) {
      // Retrying has not helped. A fresh runtime with an empty cache is the
      // last thing short of the user reinstalling; the budget in
      // crashRecovery stops this from cycling forever.
      logger.error('Error boundary loop, restarting the runtime', {
        scope: this.props.scope ?? 'app',
        message: error.message,
      });
      void restartApp('boundary-loop', `${this.props.scope ?? 'app'}: ${error.message}`);
    }
  }

  handleRetry = (): void => {
    // Not just a re-render. The data the failed tree rendered from is thrown
    // away too, so a bad cached value cannot make the retry fail the same way.
    try {
      queryClient.clear();
    } catch {
      /* the cache is a convenience; failing to clear it must not block retry */
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleRestart = (): void => {
    void restartApp('user', this.state.error?.message ?? '', { userInitiated: true });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.renderFallback) {
        return this.props.renderFallback(this.handleRetry);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Ionicons
                name="alert-circle-outline"
                size={64}
                color={colors.neutrals[600]}
              />
            </View>
            <Text style={styles.title}>
              {tr('common.somethingWentWrong', 'Something went wrong')}
            </Text>
            <Text style={styles.message}>
              {tr(
                'common.screenProblem',
                'This screen ran into a problem. The error has been logged.',
              )}
            </Text>

            <PrimaryButton
              title={tr('common.tryAgain', 'Try again')}
              onPress={this.handleRetry}
            />
            <Pressable
              onPress={this.handleRestart}
              style={styles.restart}
              accessibilityRole="button"
            >
              <Text style={styles.restartText}>
                {tr('common.restartApp', 'Restart app')}
              </Text>
            </Pressable>

            {this.props.showDetails && this.state.error && (
              <ScrollView style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>Error Details:</Text>
                <Text style={styles.detailsText}>
                  {this.state.error.message}
                </Text>
                {this.state.error.stack && (
                  <Text style={styles.stackText}>
                    {this.state.error.stack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutrals[900],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    backgroundColor: colors.neutrals[800],
    borderRadius: 999,
    padding: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.neutrals[100],
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.neutrals[300],
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  restart: {
    marginTop: 16,
    padding: 8,
  },
  restartText: {
    color: colors.neutrals[400],
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  detailsContainer: {
    marginTop: 24,
    maxHeight: 200,
    width: '100%',
    backgroundColor: colors.neutrals[800],
    borderRadius: 8,
    padding: 12,
  },
  detailsTitle: {
    color: colors.destructive,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  detailsText: {
    color: colors.destructive,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  stackText: {
    color: colors.neutrals[400],
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 8,
  },
});

export default ErrorBoundary;
