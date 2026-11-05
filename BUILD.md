# Yashwanth Hub — Build & Native Packaging Guide

This guide details how to build and package **Yashwanth Hub** across your devices, covering both **Option 1 (PWA - Recommended)** and **Option 2 (Native Android APK via Capacitor)**.

---

## 1. Quick Comparison

| Feature | Option 1: PWA (Instant) | Option 2: Native APK (Capacitor) |
| :--- | :--- | :--- |
| **Setup Time** | < 1 minute | ~15 minutes (requires Android Studio) |
| **Installation** | Add from Chrome / Edge | Sideload `.apk` file |
| **Updates** | Automatic upon republish | Manual reinstall or internal store |
| **Offline Storage** | Full (IndexedDB / Dexie) | Full (IndexedDB + Webview) |
| **Push Notifications** | Web Push API | Firebase Cloud Messaging (FCM) |
| **Target Devices** | Android Phone/Tablet, Windows Laptop | Android Phone & Tablet |

---

## 2. Option 1: Install as PWA (Recommended for Yashwanth)

Yashwanth Hub is already fully PWA-configured via `vite-plugin-pwa`, `sw.js`, and `manifest.webmanifest`.

### On Android Mobile & Tablet (Chrome / Brave):
1. Navigate to your deployment URL: `https://yashwanth-hub.vercel.app`
2. Tap the browser menu (**⋮** three dots in the top-right corner).
3. Select **Install app** (or **Add to Home screen**).
4. Yashwanth Hub will appear in your launcher/app drawer with the official logo and open full-screen without URL bars.

### On Windows Laptop & Desktop (Chrome / Edge):
1. Navigate to `https://yashwanth-hub.vercel.app` in Chrome or Edge.
2. Click the **Install** button on the right side of the URL bar (or menu > **Save and share** > **Install Yashwanth Hub**).
3. Right-click the app icon in the taskbar and select **Pin to taskbar**.

---

## 3. Option 2: Native Android APK Build (Capacitor)

If you require an installable `.apk` file to sideload onto Android devices without a browser prompt, use Capacitor.

### Application Identifier
- **App Name:** `Yashwanth Hub`
- **Application ID (Package Name):** `com.yaswanth.hub`
- **Target OS:** Android 14 / 15 (API level 34+)

---

### Step 1: Windows Prerequisites

Ensure the following tools are installed on your Windows laptop:
1. **Node.js** (v18.0 or newer): `node -v`
2. **Java JDK 17** (Temurin 17 or Oracle OpenJDK 17): `java -version`
   - Set environment variable `JAVA_HOME` to your JDK path (e.g. `C:\Program Files\Eclipse Adoptium\jdk-17.0.x`).
3. **Android Studio** (Ladybug or newer):
   - Install the **Android SDK Platform 34 or 35**.
   - Install **Android SDK Build-Tools** and **Android SDK Command-line Tools**.
   - Set environment variable `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk`.

---

### Step 2: Install Capacitor Dependencies

Run from the root of `yashwanth-hub`:

```powershell
npm install @capacitor/core @capacitor/cli @capacitor/android
```

---

### Step 3: Initialize Capacitor Configuration

Create or verify `capacitor.config.ts` in the project root:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yaswanth.hub',
  appName: 'Yashwanth Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
```

---

### Step 4: Build Web Assets & Initialize Android Project

```powershell
# 1. Build the production React web bundle
npm run build

# 2. Add the native Android platform (first time only)
npx cap add android

# 3. Synchronize web assets and plugins to Android
npx cap sync android
```

---

### Step 5: Build the Standalone APK

You can build the APK either via command line with Gradle or through Android Studio:

#### Method A: Command-Line (Fast Debug APK)
```powershell
cd android
.\gradlew.bat assembleDebug
```
The output APK will be generated at:
```text
android\app\build\outputs\apk\debug\app-debug.apk
```
Transfer `app-debug.apk` to your Android phone or tablet via USB, Google Drive, or WhatsApp, tap the file, and tap **Install**.

#### Method B: Android Studio (Signed Release APK)
```powershell
npx cap open android
```
1. Android Studio will open the `android` folder.
2. Wait for Gradle sync to complete.
3. Click **Build** > **Generate Signed Bundle / APK...**
4. Select **APK** > **Next**.
5. Select or create a release keystore (`yashwanth-release.keystore`).
6. Select build variant `release` and click **Create**.
7. Your optimized release APK will be in `android\app\release\app-release.apk`.

---

## 4. Deep Linking & OAuth Callback Configuration

For Google OAuth and NeoSapien MCP callbacks to route back into the native app, register the custom URI scheme in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="yashwanthhub" />
</intent-filter>
```

When authenticating, the redirect URI will be `yashwanthhub://auth/callback`.

---

## 5. Ongoing Sync Workflow

When you make changes to Yashwanth Hub frontend code:
```powershell
npm run build
npx cap sync android
cd android && .\gradlew.bat assembleDebug
```
The new APK is immediately ready for deployment.
