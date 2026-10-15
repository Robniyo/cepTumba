# Welcome to your Lovable project

TODO: Document your project here

## Push notifications setup

- Configure `VITE_WEB_PUSH_PUBLIC_KEY` in your frontend environment (for example `.env`).
- This key must match backend `WEB_PUSH_PUBLIC_KEY` from the VAPID pair.
- When users sign in, the app requests notification permission and registers a push subscription automatically (if supported by the browser).
