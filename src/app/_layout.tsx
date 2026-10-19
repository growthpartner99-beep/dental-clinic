import {
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from "@expo-google-fonts/figtree";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";

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

  return <Stack screenOptions={{ headerShown: false }} />;
}
