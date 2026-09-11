import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/src/lib/theme';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

/**
 * Root crash guard. Catches any render-time exception in the tree and
 * shows a recoverable fallback instead of a white screen (App Store
 * resilience requirement). Bilingual static copy — the i18n provider
 * itself may be the thing that crashed, so we never depend on it here.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] uncaught render error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.screen} testID="error-boundary-fallback">
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>Algo salió mal</Text>
          <Text style={styles.body}>
            The app hit an unexpected error. Your data is safe.{'\n'}
            La app encontró un error inesperado. Tus datos están a salvo.
          </Text>
          <Pressable
            testID="error-boundary-retry"
            style={styles.btn}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.btnText}>Try again / Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  subtitle: { color: colors.brandGold, fontSize: 13, fontWeight: '700', marginTop: 2 },
  body: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  btn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandGold,
    backgroundColor: colors.surface,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.brandGold, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});
