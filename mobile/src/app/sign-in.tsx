import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { Platform, Text, TextInput, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorBanner, Muted } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { appleSignIn, startEmailSignIn, verifyEmailSignIn } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function SignIn() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const { setAccount } = useAccount();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const signInWithApple = () =>
    run(async () => {
      // Apple embeds SHA-256(nonce) in the token; the server checks it against the raw value.
      const nonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      try {
        const cred = await AppleAuthentication.signInAsync({
          nonce: hashed,
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!cred.identityToken) throw new Error("Apple didn't return a sign-in token.");
        const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ") || null;
        setAccount(await appleSignIn(cred.identityToken, nonce, name));
      } catch (e) {
        if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
        throw e;
      }
    });

  const field = {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 17,
    color: t.text,
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.border,
  } as const;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        justifyContent: "center",
        padding: 24,
        paddingTop: insets.top + 24,
        gap: 14,
      }}
    >
      <View style={{ alignItems: "center", marginBottom: 12 }}>
        <Text style={{ fontSize: 48 }}>🎙️</Text>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: "800", marginTop: 8 }}>Notestaker</Text>
        <Muted style={{ textAlign: "center", marginTop: 6 }}>
          Meeting minutes with action items for every person.{"\n"}New accounts get 7 days of Pro free.
        </Muted>
      </View>

      <ErrorBanner message={error} />

      {appleAvailable && (
        <>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              dark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={999}
            style={{ height: 50 }}
            onPress={signInWithApple}
          />
          <Muted style={{ textAlign: "center" }}>or use your email</Muted>
        </>
      )}

      {!sent ? (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            placeholderTextColor={t.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Email"
            style={field}
          />
          <Button
            variant="primary"
            label="Email me a code"
            loading={busy}
            disabled={!email.trim()}
            onPress={() =>
              run(async () => {
                await startEmailSignIn(email.trim());
                setSent(true);
              })
            }
          />
        </>
      ) : (
        <>
          <Muted>
            We sent a 6-digit code to <Text style={{ color: t.text, fontWeight: "700" }}>{email.trim()}</Text>.
          </Muted>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={t.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            accessibilityLabel="Sign-in code"
            autoFocus
            style={[field, { letterSpacing: 6, textAlign: "center", fontSize: 22 }]}
          />
          <Button
            variant="primary"
            label="Sign in"
            loading={busy}
            disabled={code.length !== 6}
            onPress={() => run(async () => setAccount(await verifyEmailSignIn(email.trim(), code)))}
          />
          <Button
            variant="ghost"
            small
            label="Use a different email"
            onPress={() => {
              setSent(false);
              setCode("");
            }}
          />
        </>
      )}
    </View>
  );
}
