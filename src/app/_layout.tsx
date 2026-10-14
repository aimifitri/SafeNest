import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProvider, useAppContext } from "../components/shared/AppContext";
import { ProfileSelection } from "../components/shared/ProfileSelection";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { selectedCaregiver } = useAppContext();
  if (!selectedCaregiver) return <ProfileSelection />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
