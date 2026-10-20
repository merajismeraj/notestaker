import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (/^speaker$/i.test(parts[0]) && parts[1]) return parts[1].slice(0, 2);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.45 }}>{initials(name)}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "default" | "ghost" | "danger";
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = "default", small, disabled, loading, style }: ButtonProps) {
  const t = useTheme();
  const bg = variant === "primary" ? t.accent : variant === "default" ? t.surface : "transparent";
  const fg = variant === "primary" ? t.accentInk : variant === "danger" ? t.danger : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: small ? 36 : 46,
          paddingHorizontal: small ? 12 : 18,
          borderRadius: 999,
          backgroundColor: bg,
          borderWidth: variant === "default" ? 1 : 0,
          borderColor: t.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={fg} />}
      <Text style={{ color: fg, fontWeight: "600", fontSize: small ? 14 : 16 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 14,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{
        color: t.muted,
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.8,
        textTransform: "uppercase",
        marginTop: 20,
        marginBottom: 8,
        marginHorizontal: 4,
      }}
    >
      {children}
    </Text>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  const t = useTheme();
  return <Text style={[{ color: t.muted, fontSize: 14 }, style]}>{children}</Text>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View style={{ backgroundColor: t.danger + "22", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <Text style={{ color: t.danger, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

/** Bottom sheet built on Modal: no extra native dependency. */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
        </Pressable>
        <View
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "85%",
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View style={{ alignItems: "center", paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.border }} />
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{title}</Text>
            {subtitle && <Muted style={{ marginTop: 4 }}>{subtitle}</Muted>}
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 10 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 8 }}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Large selectable row used for capture modes and calendar events. */
export function OptionRow({
  icon,
  title,
  detail,
  selected,
  disabled,
  onPress,
  badge,
}: {
  icon: string;
  title: string;
  detail: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  badge?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: selected ? t.accent : t.border,
        backgroundColor: t.surface,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: icon.length > 2 ? 14 : 24, width: 56, fontWeight: "700", color: t.text }}>
        {icon}
      </Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 16, flexShrink: 1 }}>{title}</Text>
          {badge && (
            <Text
              style={{
                color: t.danger,
                backgroundColor: t.danger + "22",
                fontSize: 11,
                fontWeight: "700",
                paddingHorizontal: 6,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {badge}
            </Text>
          )}
        </View>
        <Muted style={{ marginTop: 2 }}>{detail}</Muted>
      </View>
    </Pressable>
  );
}
