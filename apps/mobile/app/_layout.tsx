import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: "#1a1a2e",
        },
        headerTintColor: "#e0e0e0",
        headerTitleStyle: {
          fontWeight: "600",
        },
        contentStyle: {
          backgroundColor: "#f5f5f7",
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Mentor" }} />
      <Stack.Screen name="chat" options={{ title: "Coach" }} />
      <Stack.Screen name="hypotheses" options={{ title: "Hypotheses" }} />
    </Stack>
  );
}
