import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from "@expo-google-fonts/figtree";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

if (!publishableKey) {
  throw new Error("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add your key to .env.\nRun: 1) clerk auth login  2) clerk link  3) clerk env pull — then restart the dev server.");
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree500: Figtree_500Medium,
    Figtree600: Figtree_600SemiBold,
    Figtree700: Figtree_700Bold,
  });

  if (__DEV__ && fontError) console.warn("useFonts failed:", fontError);

  // Android measures text with system metrics if it renders before the font is
  // ready, clipping every line's tail. Errored also counts as settled, so a
  // font failure can never leave the screen blank.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <Stack screenOptions={{ headerShown: false }} />
    </ClerkProvider>
  );
}