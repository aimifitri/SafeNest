
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LoginScreen } from "../components/auth/LoginScreen";
import {
  AppProvider,
  useAppContext,
} from "../components/shared/AppContext";
import { AuthProvider, useAuth } from "../components/shared/AuthContext";
import { HouseholdProvider } from "../components/shared/HouseholdContext";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";
import { OnboardingProvider, useOnboarding } from "../components/onboarding/OnboardingContext";
import { Btn } from "../components/shared/ui";
import { T } from "../components/shared/ui";
import { SoundEffectsProvider } from "../components/shared/SoundEffects";

export default function RootLayout() {
  return (
    <SoundEffectsProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <HouseholdProvider>
            <AppProvider>
              <OnboardingProvider>
                <RootNavigator />
              </OnboardingProvider>
            </AppProvider>
          </HouseholdProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </SoundEffectsProvider>
  );
}

function RootNavigator() {
  const { selectedCaregiver, selectCaregiver, clearCaregiver, theme } = useAppContext();
  const { session, loading, caregiver, accountError, retryAccount, signOut, demo } = useAuth();
  const onboarding = useOnboarding();

  useEffect(() => {
    if (caregiver && selectedCaregiver?.id !== caregiver.id) {
      selectCaregiver(caregiver);
    }
    if (!session && !demo) {
      clearCaregiver();
    }
  }, [caregiver, selectedCaregiver?.id, session, demo, selectCaregiver, clearCaregiver]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!session && !demo) return <LoginScreen />;

  if (!caregiver || selectedCaregiver?.id !== caregiver.id) {
    if (accountError) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: theme.colors.background }}>
          <T c={theme.colors.danger} align="center">{accountError}</T>
          <Btn onPress={retryAccount} label="Try again">Try again</Btn>
          <Btn kind="o" onPress={() => void signOut()} label="Log out">Log out</Btn>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (onboarding.open && !demo) return <OnboardingFlow />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
      }}
    />
  );
}
