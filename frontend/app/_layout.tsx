import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { I18nProvider } from "@/src/lib/i18n";
import { ensureIOSFreeAccess } from "@/src/lib/billing";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";


// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true)

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // v1.0 iOS App Store launch: silently ensure the athlete has an
  // active trial so the app operates as free-access. No-op on Android
  // and web (guarded inside the helper).
  useEffect(() => {
    ensureIOSFreeAccess();
  }, []);

  if (!loaded && !error) return null;

  return (
    <ErrorBoundary>
      <I18nProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </I18nProvider>
    </ErrorBoundary>
  );
}
