import { Show, useClerk, useSSO, useUser } from "@clerk/expo";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const CARD_HEIGHT = 435;

type SocialStrategy = "oauth_apple" | "oauth_google";

// Hero art position, matched to Design/auth-screen-design.png (fit via offline search)
const HERO = { top: 63, left: -29, width: 442, height: 328 };

const BG_COLORS = [
  "#CDE8F8",
  "#B9DDF4",
  "#99D1F2",
  "#9ACEF1",
  "#B6DBF5",
  "#C6E3F9",
  "#C6E3F9",
] as const;
const BG_LOCATIONS = [0, 0.1, 0.2, 0.3, 0.4, 0.47, 1] as const;

const CARD_COLORS = [
  "#E2F0FC",
  "#E1F1FD",
  "#E7F3FD",
  "#E8F4FD",
  "#ECF5FD",
  "#F0F7FD",
  "#F3F8FC",
] as const;
const CARD_LOCATIONS = [0, 0.24, 0.45, 0.59, 0.78, 0.93, 1] as const;

const HAZE_COLORS = [
  "rgba(240,247,255,0)",
  "rgba(240,247,255,0.66)",
] as const;

export default function AuthScreen() {
  const { startSSOFlow } = useSSO();
  const [pending, setPending] = useState<SocialStrategy | null>(null);

  const onPressSocial = async (strategy: SocialStrategy) => {
    if (pending) return;
    setPending(strategy);
    try {
      const { createdSessionId, setActive, signUp } = await startSSOFlow({
        strategy,
      });
      // SSO is the one flow that still requires activating the session manually.
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else if (signUp?.status === "missing_requirements") {
        console.warn("Sign-up missing requirements:", signUp.missingFields);
      }
      // No session and no missing requirements = user cancelled; stay silent.
    } catch (err) {
      console.error("Social sign-in failed:", JSON.stringify(err, null, 2));
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={BG_COLORS}
        locations={BG_LOCATIONS}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={HAZE_COLORS}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <Image
        source={require("../../assets/images/auth-hero.png")}
        style={styles.hero}
        contentFit="fill"
      />

      <Show when="signed-out">
        <View style={styles.card}>
          <LinearGradient
            colors={CARD_COLORS}
            locations={CARD_LOCATIONS}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.content}>
            <Text style={styles.logo}>
              <Text style={styles.logoDark}>Denta</Text>
              <Text style={styles.logoAccent}>Care</Text>
            </Text>

            <Text style={styles.headline}>
              {"Care for your smile,\nwithout the phone call"}
            </Text>

            <Text style={styles.subtitle}>Modern dental care, made easy.</Text>

            <Pressable
              accessibilityRole="button"
              disabled={pending !== null}
              onPress={() => onPressSocial("oauth_apple")}
              style={({ pressed }) => [
                styles.button,
                styles.appleButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Image
                source={require("../../assets/images/apple-logo.png")}
                style={styles.appleIcon}
              />
              <Text style={styles.appleLabel}>Continue with Apple</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={pending !== null}
              onPress={() => onPressSocial("oauth_google")}
              style={({ pressed }) => [
                styles.button,
                styles.googleButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <View style={styles.googleBorder} />
              <Image
                source={require("../../assets/images/google-g.png")}
                style={styles.googleIcon}
              />
              <Text style={styles.googleLabel}>Continue with Google</Text>
            </Pressable>

            <View style={styles.footerBlock}>
              <View style={styles.footerRow}>
                <Image
                  source={require("../../assets/images/lock-icon.png")}
                  style={styles.lockIcon}
                />
                <Text style={styles.footerSmall}>
                  By continuing, you agree to our
                </Text>
              </View>

              <Text style={styles.footerLinks}>
                <Text style={styles.link}>Privacy Policy</Text>
                <Text style={styles.footerJoiner}> and </Text>
                <Text style={styles.link}>Terms of Use</Text>
              </Text>
            </View>
          </View>
        </View>
      </Show>

      <Show when="signed-in">
        <SignedInCard />
      </Show>

      <StatusBar style="dark" />
    </View>
  );
}

function SignedInCard() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const name = user?.firstName || user?.fullName || "there";
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={CARD_COLORS}
        locations={CARD_LOCATIONS}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <Text style={styles.logo}>
          <Text style={styles.logoDark}>Denta</Text>
          <Text style={styles.logoAccent}>Care</Text>
        </Text>

        <Text style={styles.headline}>{`Welcome, ${name}`}</Text>

        {email ? <Text style={styles.subtitle}>{email}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => signOut()}
          style={({ pressed }) => [
            styles.button,
            styles.signOutButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.googleLabel}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#B9DDF4",
    overflow: "hidden",
  },
  hero: {
    position: "absolute",
    top: HERO.top,
    left: HERO.left,
    width: HERO.width,
    height: HERO.height,
  },
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: CARD_HEIGHT,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    overflow: "hidden",
    borderTopWidth: 2,
    borderTopColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: 31.7,
  },
  logo: {
    fontFamily: "Figtree700",
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: 0,
  },
  logoDark: {
    color: "#26517A",
  },
  logoAccent: {
    color: "#00CAF5",
  },
  headline: {
    fontFamily: "Figtree600",
    fontSize: 28,
    lineHeight: 37.4,
    letterSpacing: -0.6,
    color: "#083A60",
    textAlign: "center",
    marginTop: 10.5,
  },
  subtitle: {
    fontFamily: "Figtree500",
    fontSize: 13.2,
    lineHeight: 16,
    color: "#3B5D77",
    marginTop: 9.5,
  },
  button: {
    width: 321,
    height: 51,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  appleButton: {
    backgroundColor: "#05080D",
    paddingLeft: 45.5,
    gap: 36,
    marginTop: 25.75,
    shadowColor: "#1975AD",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  appleIcon: {
    width: 20.5,
    height: 24.6,
  },
  appleLabel: {
    fontFamily: "Figtree600",
    fontSize: 15,
    color: "#FFFFFF",
  },
  googleButton: {
    marginTop: 18.7,
    paddingLeft: 44.2,
    gap: 34.6,
    backgroundColor: "#F3F9FE",
    shadowColor: "#45A3E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  signOutButton: {
    marginTop: 25.75,
    justifyContent: "center",
    backgroundColor: "#F3F9FE",
    shadowColor: "#45A3E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  googleBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  googleIcon: {
    width: 23.2,
    height: 24.1,
  },
  googleLabel: {
    fontFamily: "Figtree600",
    fontSize: 15,
    color: "#1E3350",
  },
  footerBlock: {
    width: 174,
    alignSelf: "center",
    alignItems: "flex-start",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7.5,
    marginTop: 30.5,
    marginLeft: -1.5,
  },
  lockIcon: {
    width: 10.6,
    height: 13.4,
  },
  footerSmall: {
    fontFamily: "Figtree500",
    fontSize: 10.75,
    lineHeight: 15,
    color: "#49627D",
  },
  footerLinks: {
    marginTop: -1,
  },
  link: {
    fontFamily: "Figtree600",
    fontSize: 12,
    lineHeight: 17,
    color: "#0B82C8",
  },
  footerJoiner: {
    fontFamily: "Figtree500",
    fontSize: 12,
    lineHeight: 17,
    color: "#49627D",
  },
});
