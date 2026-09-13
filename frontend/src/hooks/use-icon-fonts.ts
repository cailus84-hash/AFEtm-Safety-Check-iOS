// Icon font readiness hook.
//
// Since the migration to @react-native-vector-icons/* (Expo SDK 56+),
// each icon package registers its own font through expo-font at import
// time — in Expo Go, dev/prod builds and on web alike. No manual CDN
// loading is needed anymore, so this hook resolves immediately. It is
// kept so app/_layout.tsx retains a single splash-gating point.
// Usage: const [loaded, error] = useIconFonts();

export const useIconFonts = (): readonly [boolean, Error | null] =>
  [true, null] as const;
