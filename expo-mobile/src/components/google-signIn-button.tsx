import React from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "./ui";
import { useGoogleLogin } from "@/api/auth-api";

import { ToastAndroid, Platform } from "react-native";
import { showGlobalDialog } from "@/components/dialog";

interface GoogleSignInButtonProps {
  onSuccess?: (userInfo: any) => void;
  onError?: (error: any) => void;
  disabled?: boolean;
}

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!;

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  offlineAccess: true,
});

export function GoogleSignInButton({
  onSuccess,
  onError,
  disabled,
}: GoogleSignInButtonProps) {
  const { colors } = useTheme();
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const loginWithGoogle = useGoogleLogin();

  const signIn = async () => {
    if (isSigningIn || loginWithGoogle.isPending || disabled) return;

    setIsSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices();

      // Force account selection by signing out first
      try {
        await GoogleSignin.signOut();
      } catch {
        // Ignore if not signed in
      }

      const response = await GoogleSignin.signIn();

      // In some versions idToken is nested in data, in others it's top-level
      const idToken = response.data?.idToken || (response as any).idToken;

      if (idToken) {
        loginWithGoogle.mutate({
          idToken: idToken,
        });
        onSuccess?.(response);
      } else {
        throw new Error("Google Sign-In failed: ID token is missing.");
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        if (Platform.OS === "android") {
          ToastAndroid.show("Sign-in cancelled", ToastAndroid.SHORT);
        }
        return;
      }

      if (error.code === statusCodes.IN_PROGRESS) {
        return;
      }

      // Handle other Google Sign-In errors (e.g., developer error, play services)
      const message =
        error?.message?.toString() || "An error occurred during Google Sign-In";
      showGlobalDialog({
        title: "Google Sign-In Error",
        message: message,
        type: "error",
      });

      onError?.(error);
    } finally {
      setIsSigningIn(false);
    }
  };

  const isLoading = isSigningIn || loginWithGoogle.isPending;

  return (
    <Button
      variant="outline"
      onPress={signIn}
      size="lg"
      loading={isLoading}
      disabled={disabled || isLoading}
      leftIcon={<Ionicons name="logo-google" size={20} color={colors.text} />}
      title="Continue with Google"
      style={{ width: "100%" }}
    />
  );
}
