import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Visual values below were measured off Design/onboarding-design-1 (1).png
// (800px-wide screen area in the mockup) and scaled to this device's width.
const AQUA_GRADIENT = ["#0BAACC", "#74D8F1"] as const;
const BG_GRADIENT = ["#C8E4FA", "#D9EBFD", "#EDF6FE"] as const;
const BG_LOCATIONS = [0, 0.5, 1] as const;

type Gender = "male" | "female" | "other";

const GENDERS: { key: Gender; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [gender, setGender] = useState<Gender>("male");

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={BG_GRADIENT}
        locations={BG_LOCATIONS}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]}
        locations={[0, 0.35]}
        style={StyleSheet.absoluteFill}
      />

      <Image
        source={require("../../assets/images/onboarding-bubbles-top.png")}
        style={styles.bubblesTop}
        contentFit="fill"
      />
      <Image
        source={require("../../assets/images/onboarding-bubbles-bottom.png")}
        style={styles.bubblesBottom}
        contentFit="fill"
      />

      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={styles.logoDark}>Denta</Text>
          <Text style={styles.logoAccent}>Care</Text>
        </Text>
        <Text style={styles.tagline}>Care for your smile</Text>
      </View>

      <View style={[styles.card, { marginBottom: insets.bottom + 29 }]}>
        <Image
          source={require("../../assets/images/onboarding-sparkle.png")}
          style={styles.cardSparkle}
          contentFit="fill"
        />

        <ScrollView
          contentContainerStyle={styles.cardContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepRow}>
            <Text style={styles.stepText}>1 of 4</Text>
          </View>

          <View style={styles.progress}>
            <LinearGradient
              colors={["#05B2CD", "#6FDAE8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.progressFill}
            />
            <View style={styles.progressTrack} />
            <View style={styles.progressTrack} />
            <View style={styles.progressTrack} />
          </View>

          <Text style={styles.title}>Tell us about you</Text>
          <Text style={styles.subtitle}>
            We&apos;ll create your personal profile.
          </Text>

          <Text style={styles.label}>First name</Text>
          <TextInput
            accessibilityLabel="First name"
            placeholder="Enter your first name"
            placeholderTextColor="#94A3B9"
            style={styles.input}
          />

          <Text style={[styles.label, styles.labelSpacing]}>Last name</Text>
          <TextInput
            accessibilityLabel="Last name"
            placeholder="Enter your last name"
            placeholderTextColor="#94A3B9"
            style={styles.input}
          />

          <Text style={[styles.label, styles.labelSpacing]}>Date of birth</Text>
          <View style={styles.inputWrap}>
            <TextInput
              accessibilityLabel="Date of birth"
              placeholder="MM / DD / YYYY"
              placeholderTextColor="#94A3B9"
              keyboardType="numbers-and-punctuation"
              style={[styles.input, styles.inputWithIcon]}
            />
            <Image
              source={require("../../assets/images/onboarding-calendar-icon.png")}
              style={styles.calendarIcon}
              contentFit="fill"
            />
          </View>

          <Text style={[styles.label, styles.labelSpacing]}>Phone number</Text>
          <View style={styles.inputWrap}>
            <TextInput
              accessibilityLabel="Phone number"
              placeholder="(555) 123-4567"
              placeholderTextColor="#94A3B9"
              keyboardType="phone-pad"
              style={[styles.input, styles.inputPhone]}
            />
            <Image
              source={require("../../assets/images/onboarding-phone-strip.png")}
              style={styles.phoneStrip}
              contentFit="fill"
            />
          </View>

          <Text style={[styles.label, styles.labelGender]}>Gender</Text>
          <View style={styles.chipRow}>
            {GENDERS.map(({ key, label }) => {
              const selected = gender === key;
              const chip = [styles.chip, selected && styles.chipSelected];
              const text = [styles.chipText, selected && styles.chipTextSelected];
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={key}
                  onPress={() => setGender(key)}
                  style={({ pressed }) => [...chip, pressed && styles.pressed]}
                >
                  {selected ? (
                    <LinearGradient
                      colors={AQUA_GRADIENT}
                      start={{ x: 0, y: 1 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <Text style={text}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={AQUA_GRADIENT}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueGradient}
            >
              <Text style={styles.continueLabel}>Continue</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>

      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  bubblesTop: {
    position: "absolute",
    top: 49,
    left: 302,
    width: 98,
    height: 111,
  },
  bubblesBottom: {
    position: "absolute",
    top: 733,
    left: 1,
    width: 61,
    height: 121,
  },
  header: {
    paddingTop: 83,
    alignItems: "center",
  },
  logo: {
    fontFamily: "Figtree700",
    fontSize: 28,
    lineHeight: 34,
  },
  logoDark: {
    color: "#073B70",
  },
  logoAccent: {
    color: "#05BCEA",
  },
  tagline: {
    fontFamily: "Figtree500",
    fontSize: 14,
    lineHeight: 18,
    color: "#40648E",
    marginTop: 8,
  },
  card: {
    flex: 1,
    marginHorizontal: 30,
    marginTop: 20,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor: "#EBF4FD",
    overflow: "hidden",
    boxShadow: "0px 6px 20px rgba(255,255,255,0.85)",
  },
  cardSparkle: {
    position: "absolute",
    top: 26,
    right: 26,
    width: 17,
    height: 18,
  },
  cardContent: {
    paddingHorizontal: 31,
    paddingTop: 23,
    paddingBottom: 32,
  },
  stepRow: {
    height: 20,
    justifyContent: "center",
  },
  stepText: {
    fontFamily: "Figtree600",
    fontSize: 15,
    lineHeight: 20,
    color: "#0064B5",
  },
  progress: {
    flexDirection: "row",
    gap: 2,
    marginTop: 19,
    height: 7,
  },
  progressFill: {
    flex: 1,
    borderRadius: 3.5,
  },
  progressTrack: {
    flex: 1,
    borderRadius: 3.5,
    backgroundColor: "#D3E7F7",
  },
  title: {
    fontFamily: "Figtree700",
    fontSize: 28,
    lineHeight: 34,
    color: "#002A5E",
    marginTop: 23,
  },
  subtitle: {
    fontFamily: "Figtree500",
    fontSize: 16,
    lineHeight: 22,
    color: "#3C5E88",
    marginTop: 9,
  },
  label: {
    fontFamily: "Figtree600",
    fontSize: 14,
    lineHeight: 18,
    color: "#123A6C",
    marginTop: 19,
  },
  labelSpacing: {
    marginTop: 12,
  },
  labelGender: {
    marginTop: 16,
  },
  input: {
    fontFamily: "Figtree500",
    fontSize: 14,
    color: "#123A6C",
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor: "#F6FAFE",
    paddingHorizontal: 14,
    marginTop: 16,
    boxShadow: "0px 2px 6px rgba(24,146,196,0.10)",
  },
  inputWrap: {
    position: "relative",
  },
  inputWithIcon: {
    paddingRight: 42,
  },
  inputPhone: {
    paddingLeft: 82,
  },
  calendarIcon: {
    position: "absolute",
    right: 10,
    top: 27,
    width: 21,
    height: 22,
  },
  phoneStrip: {
    position: "absolute",
    left: 9,
    top: 21,
    width: 73,
    height: 33,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 9,
  },
  chip: {
    flex: 1,
    height: 39,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor: "#F6FAFE",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 6px rgba(24,146,196,0.10)",
  },
  chipSelected: {
    borderWidth: 0,
    backgroundColor: "transparent",
    overflow: "hidden",
    boxShadow: "0px 6px 14px rgba(20,172,207,0.30)",
  },
  chipText: {
    fontFamily: "Figtree600",
    fontSize: 14,
    color: "#04215A",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  continueButton: {
    marginTop: 29,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    boxShadow: "0px 8px 18px rgba(20,172,207,0.35)",
  },
  continueGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  continueLabel: {
    fontFamily: "Figtree600",
    fontSize: 17,
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.85,
  },
});
