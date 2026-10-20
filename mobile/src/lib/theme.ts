import { useColorScheme } from "react-native";

const light = {
  bg: "#f6f7fb",
  surface: "#ffffff",
  surface2: "#eef0f6",
  text: "#151826",
  muted: "#646a80",
  border: "#e1e4ee",
  accent: "#4f6bed",
  accentInk: "#ffffff",
  danger: "#d1495b",
  ok: "#1f9d74",
  warn: "#b08710",
};

const dark: typeof light = {
  bg: "#0e1017",
  surface: "#171a24",
  surface2: "#20242f",
  text: "#e9ebf3",
  muted: "#9298ad",
  border: "#2a2f3c",
  accent: "#7088ff",
  accentInk: "#0e1017",
  danger: "#ef6b7c",
  ok: "#3cc39a",
  warn: "#e0b43a",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
