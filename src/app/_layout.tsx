
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
import { Btn } from "../components/shared/ui";
import { T } from "../components/shared/ui";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <RootNavigator />
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { selectedCaregiver, selectCaregiver, clearCaregiver, theme } = useAppContext();
  const { session, loading, caregiver, accountError, retryAccount, signOut } = useAuth();

  useEffect(() => {
    if (caregiver && selectedCaregiver?.id !== caregiver.id) {
      selectCaregiver(caregiver);
    }
    if (!session) {
      clearCaregiver();
    }
  }, [caregiver, selectedCaregiver?.id, session, selectCaregiver, clearCaregiver]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

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

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
      }}
    />
  );
}
