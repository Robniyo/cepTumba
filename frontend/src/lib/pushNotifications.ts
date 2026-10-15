const WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
const PUSH_PREFERENCE_KEY = "cep.push.notifications.enabled";

export type PushSubscriptionStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

const parseApiError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(", ");
    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }
  } catch {
    // Ignore parsing errors and use fallback.
  }

  return fallback;
};

const getUnsupportedStatus = (): PushSubscriptionStatus => ({
  supported: false,
  permission: "unsupported",
  subscribed: false,
});

const isPushSupported = (): boolean => {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
};

const buildStatus = (subscribed: boolean): PushSubscriptionStatus => ({
  supported: true,
  permission: Notification.permission,
  subscribed,
});

const setPushPreference = (enabled: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PUSH_PREFERENCE_KEY, enabled ? "true" : "false");
};

const getPushRegistration = async (): Promise<ServiceWorkerRegistration> => {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  return navigator.serviceWorker.register("/push-sw.js");
};

const getCurrentSubscription = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) {
    return null;
  }

  const registration = await getPushRegistration();
  return registration.pushManager.getSubscription();
};

export const isPushNotificationsPreferenceEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(PUSH_PREFERENCE_KEY) !== "false";
};

export const getPushSubscriptionStatus = async (): Promise<PushSubscriptionStatus> => {
  if (!isPushSupported()) {
    return getUnsupportedStatus();
  }

  try {
    const subscription = await getCurrentSubscription();
    return buildStatus(Boolean(subscription));
  } catch {
    return buildStatus(false);
  }
};

export const registerPushSubscription = async (
  accessToken: string,
  apiBaseUrl: string,
): Promise<PushSubscriptionStatus> => {
  if (!isPushSupported()) {
    return getUnsupportedStatus();
  }

  if (!WEB_PUSH_PUBLIC_KEY) {
    throw new Error("Push notifications are not configured for this app.");
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    return buildStatus(false);
  }

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        WEB_PUSH_PUBLIC_KEY,
      ) as unknown as BufferSource,
    });
  }

  const payload = subscription.toJSON();
  const p256dh = payload.keys?.p256dh;
  const auth = payload.keys?.auth;

  if (!payload.endpoint || !p256dh || !auth) {
    return buildStatus(false);
  }

  const response = await fetch(`${apiBaseUrl}/notifications/push-subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      endpoint: payload.endpoint,
      keys: {
        p256dh,
        auth,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to enable push notifications."));
  }

  return buildStatus(true);
};

export const enablePushNotifications = async (
  accessToken: string,
  apiBaseUrl: string,
): Promise<PushSubscriptionStatus> => {
  const status = await registerPushSubscription(accessToken, apiBaseUrl);

  if (!status.supported) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  if (status.permission === "denied") {
    throw new Error(
      "Push notifications are blocked in your browser settings. Allow notifications and try again.",
    );
  }

  if (!status.subscribed) {
    throw new Error("Allow notifications to enable push alerts for this device.");
  }

  setPushPreference(true);
  return status;
};

export const disablePushNotifications = async (
  accessToken: string,
  apiBaseUrl: string,
): Promise<PushSubscriptionStatus> => {
  setPushPreference(false);

  if (!isPushSupported()) {
    return getUnsupportedStatus();
  }

  const subscription = await getCurrentSubscription();
  if (!subscription) {
    return buildStatus(false);
  }

  const response = await fetch(`${apiBaseUrl}/notifications/push-subscriptions`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to disable push notifications."));
  }

  await subscription.unsubscribe();
  return buildStatus(false);
};
