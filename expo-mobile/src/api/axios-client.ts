import { AUTH_TOKEN_NAME, handleToken } from "@/utils/handle-token";
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getDeviceInfo } from "@/utils/device-info";
import { performLogout } from "@/lib/logout-handler";
import { showGlobalDialog } from "@/components/dialog";

/**
 * Update this URL with your actual backend API base URL
 */
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const axiosClient = axios.create({
  baseURL: BASE_URL,
  timeout: 100000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

let isSessionExpiredDialogShowing = false;

// Request Interceptor
axiosClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = handleToken.getToken(AUTH_TOKEN_NAME);
      if (token) {
        config.headers.Token = token;
      }

      config.headers["X-Platform"] = "mobile";

      // Conditionally send device info headers for auth routes
      const authRoutes = ["/auth/login", "/auth/register", "/sso/google"];
      if (
        config.url &&
        authRoutes.some((route) => config.url?.includes(route))
      ) {
        const { deviceName, ip } = await getDeviceInfo();
        config.headers["X-Device-Name"] = deviceName;
        config.headers["X-IP"] = ip;
      }

      return config;
    } catch (error) {
      console.log({ error });
      return config;
    }
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response Interceptor

axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      console.error("API Error Response:", error.response.data);

      if (status === 401 || status === 403) {
        if (!isSessionExpiredDialogShowing) {
          isSessionExpiredDialogShowing = true;
          showGlobalDialog({
            title: "Session Expired",
            message: "Your session has expired. Please log in again to continue.",
            type: "warning",
            confirmText: "Login",
            onConfirm: () => {
              isSessionExpiredDialogShowing = false;
              performLogout();
            },
          });
        }
      }
    } else if (error.request) {
      console.error("API No Response:", error.request);
    } else {
      console.error("API Setup Error:", error.message);
    }

    return Promise.reject(error);
  },
);

export default axiosClient;
