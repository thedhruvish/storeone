import { showGlobalDialog } from "@/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import axiosClient from "./axios-client";
import { AUTH_TOKEN_NAME, handleToken } from "@/utils/handle-token";
import { useUserStore } from "@/store/user-store";
import { getCurrentUser } from "./user-api";
import { performLogout } from "@/lib/logout-handler";

export const authApi = {
  login: async (data: any) => {
    const response = await axiosClient.post("/auth/login", data);
    return response.data;
  },

  register: async (data: any) => {
    const response = await axiosClient.post("/auth/register", data);
    return response.data;
  },

  verifyOtp: async (data: { userId: string; otp: string }) => {
    const response = await axiosClient.post("/sso/verify-otp", data);
    return response.data;
  },

  resendOtp: async (userId: string) => {
    const response = await axiosClient.post("/sso/resend-otp", { userId });
    return response.data;
  },

  googleLogin: async (data: {
    idToken: string;
    deviceName?: string;
    ip?: string;
  }) => {
    const response = await axiosClient.post("/sso/google", data);
    return response.data;
  },

  logout: async () => {
    const response = await axiosClient.post("/sso/logout");
    return response.data;
  },
  authTokenVerify: async (id: string) => {
    const response = await axiosClient.post(`/sso/link/${id}`);
    return response.data;
  },
};

export function useLogin() {
  const router = useRouter();
  const { setUser } = useUserStore();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: async (data) => {
      if (data.data.sessionId) {
        await handleToken.setToken(AUTH_TOKEN_NAME, data.data.sessionId);

        try {
          // PROACTIVELY FETCH USER BEFORE REDIRECT
          const userResponse = await getCurrentUser();
          if (userResponse.data) {
            setUser(userResponse.data);
          }
          router.replace("/(tabs)");
        } catch (error) {
          console.error("Failed to fetch user after login", error);
          router.replace("/(tabs)"); // Redirect anyway, AuthProvider will catch it
        }
      } else if (data.data?.is_verfiy_otp) {
        router.push({
          pathname: "/(auth)/otp",
          params: {
            userId: data.data?.userId,
          },
        });
      } else if (data.data.showSetUp2Fa) {
      }
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message?.toString() ||
        error.message?.toString() ||
        "An unexpected error occurred";
      showGlobalDialog({
        title: "Error",
        message: message,
        type: "error",
      });
    },
  });
}

export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      router.push({
        pathname: "/(auth)/otp",
        params: {
          userId: data.data?.userId,
        },
      });
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message?.toString() ||
        error.message?.toString() ||
        "Failed to register";
      showGlobalDialog({
        title: "Error",
        message: message,
        type: "error",
      });
    },
  });
}

export function useVerifyOtp() {
  const router = useRouter();
  const { setUser } = useUserStore();

  return useMutation({
    mutationFn: authApi.verifyOtp,
    onSuccess: async (data) => {
      if (data.data.sessionId) {
        handleToken.setToken(AUTH_TOKEN_NAME, data.data.sessionId);

        try {
          const userResponse = await getCurrentUser();
          if (userResponse.data) {
            setUser(userResponse.data);
          }
          router.replace("/(tabs)");
        } catch (error) {
          console.error("Failed to fetch user after OTP", error);
          router.replace("/(tabs)");
        }
      } else if (data.data?.is_verfiy_otp) {
        router.push({
          pathname: "/(auth)/otp",
          params: {
            userId: data.data?.userId,
          },
        });
      } else if (data.data.showSetUp2Fa) {
      }
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message?.toString() ||
        error.message?.toString() ||
        "An unexpected error occurred";
      showGlobalDialog({
        title: "Error",
        message: message,
        type: "error",
      });
    },
  });
}
export const useResendOtp = () => {
  return useMutation({
    mutationFn: authApi.resendOtp,
  });
};

export function useGoogleLogin() {
  const router = useRouter();
  const { setUser } = useUserStore();

  return useMutation({
    mutationFn: authApi.googleLogin,
    onSuccess: async (data) => {
      if (data.data.sessionId) {
        handleToken.setToken(AUTH_TOKEN_NAME, data.data.sessionId);

        try {
          const userResponse = await getCurrentUser();
          if (userResponse.data) {
            setUser(userResponse.data);
          }
          router.replace("/(tabs)");
        } catch (error) {
          console.error("Failed to fetch user after Google login", error);
          router.replace("/(tabs)");
        }
      } else if (data.data?.is_verfiy_otp) {
        router.push({
          pathname: "/(auth)/otp",
          params: {
            userId: data.data?.userId,
          },
        });
      } else if (data.data.showSetUp2Fa) {
      }
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message?.toString() ||
        error.message?.toString() ||
        "Google Sign-In failed";
      showGlobalDialog({
        title: "Error",
        message: message,
        type: "error",
      });
    },
  });
}
export function useLogout() {
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      performLogout();
    },
    onError: async () => {
      performLogout();
    },
  });
}

// handle the tokens for link devices
export const useTokenVerifyForLink = () => {
  return useMutation({
    mutationFn: authApi.authTokenVerify,
  });
};
