import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AccountProvider, useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";

function RootStack() {
  const t = useTheme();
  const { account } = useAccount();
  if (account === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  const signedIn = account !== null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: "Notestaker", headerLargeTitle: true }} />
        <Stack.Screen name="m/[id]" options={{ title: "" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AccountProvider>
        <StatusBar style="auto" />
        <RootStack />
      </AccountProvider>
    </SafeAreaProvider>
  );
}
