import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import PrimaryButton from './ui/PrimaryButton';
import { createLogger } from '../libs/logger';

const logger = createLogger('ErrorBoundary');

interface Props {
  children: ReactNode;
  /** Optional fallback component */
  fallback?: ReactNode;
  /** Called when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show error details (dev only) */
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
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
      componentStack: errorInfo.componentStack?.slice(0, 1500),
    });

    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // logger.error above ships this to client_error_logs via libs/errorReporter,
    // so a render crash on a tester's phone is readable. Native crashes (an
    // OutOfMemoryError, an ExoPlayer fault) still need Crashlytics — the JS
    // thread never hears about those.
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
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
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              The app encountered an unexpected error. Please try again.
            </Text>

            <PrimaryButton title="Try Again" onPress={this.handleRetry} />

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
