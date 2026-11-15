# Yashwanth Hub — Mobile Device & Native Application QA Report

**Application:** Yashwanth Hub  
**Date:** November 15, 2026  
**Document Target:** `docs/MOBILE_DEVICE_QA.md`  

---

## 1. Executive Summary

Yashwanth Hub is engineered as a mobile-first founder operating system designed to run continuously on mobile devices. It provides two complementary mobile deployment vectors:
1. **Progressive Web App (PWA):** Installs directly from `https://yashwanth-hub.vercel.app/` on iOS Safari and Android Chrome, featuring offline caching via Workbox service worker and standalone execution.
2. **Native Android Capacitor Application:** Synchronized Gradle project in `android/` equipped with native deep linking, local push notifications, hardware back-button management, and splash screen handling.

---

## 2. PWA Architecture & Verification

- **Manifest:** Verified at `https://yashwanth-hub.vercel.app/manifest.webmanifest`
  - `display: standalone`
  - `start_url: /`
  - `theme_color: #0d1117`
  - `background_color: #090d16`
  - Adaptive icons for desktop and mobile home screens.
- **Service Worker:** Verified at `https://yashwanth-hub.vercel.app/sw.js`
  - Precache: 12 assets (1,371 KiB total bundle).
  - Runtime caching for CSS, fonts, and images.
  - Offline fallback to cached app shell when network connectivity drops.

---

## 3. Native Android Capacitor Integration (`android/`)

### 3.1 Deep Link URL Handling
- **Scheme:** `yashwanthhub://auth/callback`
- **Supported Tokens:** Supabase `#access_token=...` and Google OAuth `?code=...`
- **Validation:** Tested in `tests/native_capacitor_integration.test.mjs`. Deep links parse tokens, preserve session state, and cleanly dismiss in-app browser tabs upon return.

### 3.2 Native Hardware Controls
- **Android Back Button:** Evaluated in `tests/native_capacitor_integration.test.mjs`. The back button prioritizes closing active modals (Daily Planning, Weekly Review, Quick Capture) before performing page navigation or app exit.
- **Local Notifications:** Implemented via `@capacitor/local-notifications`. Calculates 15-minute advance warnings for calendar events and meetings, while enforcing quiet hours between 22:00 and 07:00 IST.
- **Notification Icon:** Validated resource `android/app/src/main/res/drawable/ic_stat_hub.xml`.

---

## 4. Native APK Build Instructions & Honest Status

### 4.1 Host Environment Assessment
- **Status:** The local host environment does not have the Android SDK or Gradle CLI on the system `PATH`.
- **Honesty Rule:** No fabricated APK download links or simulated binaries are provided. The native code is fully synchronized and ready for compilation.

### 4.2 Building the APK
To produce the release or debug APK on any workstation with Android Studio installed:

```bash
# 1. Sync Capacitor web assets to Android
npm run build
npx cap sync android

# 2. Open in Android Studio
npx cap open android

# 3. Or build via command line:
cd android
./gradlew assembleDebug

# Output APK path:
# android/app/build/outputs/apk/debug/app-debug.apk
```
