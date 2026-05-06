import { useUserStore } from "@/store/user-store";
import { AUTH_TOKEN_NAME, handleToken } from "@/utils/handle-token";
import { router } from "expo-router";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

let isLoggingOut = false;

export const performLogout = async () => {
  if (isLoggingOut) return;

  isLoggingOut = true;

  try {
    // Clear Google Sign-In session if it exists
    await GoogleSignin.signOut();
  } catch (error) {
    console.log("Google Sign-Out Error during logout:", error);
  }

  // Clear token
  handleToken.deleteToken(AUTH_TOKEN_NAME);

  // Clear store
  useUserStore.getState().logout();

  // Small delay prevents navigation race
  setTimeout(() => {
    router.replace("/(auth)/login");
    isLoggingOut = false;
  }, 100);
};
