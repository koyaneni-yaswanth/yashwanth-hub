# Yashwanth Hub — Native Mobile & Packaging Guide

This document contains the exact commands and architecture for running and building **Yashwanth Hub** as a native mobile application using **Capacitor**, alongside the web app and PWA.

---

## 1. Project Specifications

- **Application Name:** `Yashwanth Hub`
- **Application ID (Package Name):** `com.yaswanth.hub`
- **Custom Deep Link Schemes:** `com.yaswanth.hub://` and `yashwanthhub://`
- **Framework:** React 19 + TypeScript + Vite + Tailwind CSS + Dexie (IndexedDB)
- **Native Engine:** Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`)
- **Native Plugins:**
  - `@capacitor/app`: Deep-link routing and Android hardware/gesture back button.
  - `@capacitor/local-notifications`: Native local reminders for tasks and calendar events.
  - `@capacitor/splash-screen`: Native branded splash screen with Pawan Shakti turbine.
  - `@capacitor/status-bar`: Dynamic status bar style matched to dark/light theme.

---

## 2. Building Android APK on Windows (Step-by-Step)

### Prerequisites on Windows
1. **Node.js**: v18.0 or newer (`node -v`).
2. **Java JDK 17**: Eclipse Temurin JDK 17 or Oracle OpenJDK 17 (`java -version`).
   - Set environment variable `JAVA_HOME` (e.g., `C:\Program Files\Eclipse Adoptium\jdk-17.0.x`).
3. **Android Studio** (Ladybug / Koala or newer):
   - Open Android Studio SDK Manager.
   - Install **Android SDK Platform 34 or 35**.
   - Install **Android SDK Build-Tools** and **Android SDK Command-line Tools**.
   - Set environment variable `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk`.

---

### Step 1: Compile Web Assets
From the repository root on PowerShell:
```powershell
npm run build
```

---

### Step 2: Synchronize Capacitor Native Files
```powershell
npx cap sync android
```
*(This copies the latest web bundle from `dist/` into `android/app/src/main/assets/public` and updates Android Gradle plugins.)*

---

### Step 3: Compile the Android APK

#### Option A: Fast Command-Line Build (Debug APK)
```powershell
cd android
.\gradlew.bat assembleDebug
```
The compiled APK will be located at:
```text
android\app\build\outputs\apk\debug\app-debug.apk
```

**To install directly to a connected Android phone or tablet via ADB:**
```powershell
adb install android\app\build\outputs\apk\debug\app-debug.apk
```
*(Or transfer `app-debug.apk` to your phone via Google Drive, USB cable, or WhatsApp and tap **Install**).*

#### Option B: Android Studio Build (Signed Release APK)
From the project root:
```powershell
npx cap open android
```
1. Android Studio will open the native project.
2. Wait for Gradle sync to index.
3. In the top menu, select **Build** > **Generate Signed Bundle / APK...**
4. Choose **APK** and click **Next**.
5. Select or create your keystore (`yashwanth.keystore`), set password, and choose build variant `release`.
6. Click **Finish**. The optimized production `.apk` will be output to:
   ```text
   android\app\release\app-release.apk
   ```

---

## 3. Building iOS on a Mac (Step-by-Step)

> [!NOTE]
> Building the iOS app requires a Mac with macOS Sonoma or Sequoia and Xcode 15 or 16 installed. iOS applications cannot be compiled on Windows.

### Prerequisites on Mac
1. **macOS**: Sonoma 14 or Sequoia 15.
2. **Xcode**: 15.0 or newer from Mac App Store.
3. **Xcode Command Line Tools**: `xcode-select --install`.
4. **Node.js**: v18.0 or newer (`brew install node`).

---

### Step 1: Clone and Install
```bash
git clone https://github.com/koyaneni-yaswanth/yashwanth-hub.git
cd yashwanth-hub
npm install
```

---

### Step 2: Build Web Assets & Sync iOS Platform
```bash
npm run build
npx cap sync ios
```

---

### Step 3: Open and Run in Xcode
```bash
npx cap open ios
```
1. Xcode opens the native project at `ios/App/App.xcworkspace`.
2. In the left navigator, select the top-level **App** project.
3. Go to the **Signing & Capabilities** tab:
   - Check **Automatically manage signing**.
   - Under **Team**, select your Apple Developer account or personal Apple ID.
   - Bundle Identifier will be `com.yaswanth.hub`.
4. Select your connected iPhone (or an iOS Simulator like iPhone 16 Pro) in the target device dropdown at the top.
5. Press **Cmd + R** (or click the **Play** button) to build and run on your device.

---

### Step 4: Archive for TestFlight / App Store
1. In Xcode, set the build destination to **Any iOS Device (arm64)**.
2. Click **Product** > **Archive**.
3. Once the archive completes in the Organizer window, click **Distribute App** > **App Store Connect / TestFlight**.

---

## 4. Google Sign-In & Supabase OAuth in Native Mode

### Why Standard Google Web Popups Fail in WebViews
Google prohibits OAuth 2.0 authorization within embedded webviews (`disallowed_useragent` HTTP 403 error). 

### How Yashwanth Hub Solves This
1. When tapping **Connect Google Account** in native mode (`CapacitorService.isNative()`):
   - The app opens the OAuth endpoint in the user's **external system browser** (`window.open(url, '_system')`).
   - The redirect URI is set to custom scheme: `com.yaswanth.hub://auth/callback`.
2. When the user approves the prompt in Chrome/Safari:
   - Google / Supabase redirects to `com.yaswanth.hub://auth/callback#access_token=...&refresh_token=...`.
   - Android/iOS intercepts this scheme via the registered `<intent-filter>` / `CFBundleURLTypes` and focuses Yashwanth Hub.
   - `@capacitor/app` triggers the `appUrlOpen` event in `CapacitorService.handleDeepLinkUrl(url)`.
   - The service extracts `access_token` and `refresh_token` and establishes the session with `supabase.auth.setSession()`.
   - The Google Workspace access token is simultaneously saved in `GoogleAuthService.saveConfig()`.

### Session Persistence Across Restarts
Supabase JS client is initialized with `persistSession: true`. The authentication state is saved into persistent storage (`localStorage`), which in Android WebView and iOS WKWebView is preserved when the user kills the app and reopens it. On cold boot, `supabase.auth.getSession()` automatically rehydrates the authenticated user.

---

## 5. Native Notifications & Reminders

### Features
- Native notification channel `yashwanth_reminders` created on Android with sound, vibration, and high priority.
- Event reminders: Automatically scheduled 15 minutes prior to calendar meetings.
- Task reminders: Automatically scheduled at 9:00 AM on the task's due date.
- Quiet hours protection: Automatically mutes alerts between 22:00 (10:00 PM) and 07:00 (7:00 AM), matching user preferences in Settings.
- Android 13+ runtime notification permission request handled via `LocalNotifications.requestPermissions()`.

---

## 6. Android Back Button & Safe Area Handling

### Android Back Button Hierarchy
When the Android hardware back button or swipe-back gesture is triggered:
1. If the Command Palette (Ctrl+K) is open &rarr; Closes the Command Palette.
2. If the Mobile Navigation drawer is open &rarr; Closes the drawer.
3. If an error modal or dialog is open &rarr; Closes the modal.
4. If on a sub-page (e.g. Tasks, Meetings, Expenses) &rarr; Returns to the Dashboard.
5. If already on the Dashboard &rarr; Minimizes the app (`App.minimizeApp()`) without terminating background sync.

### Safe Area Inset Support
- In `index.html`: `viewport-fit=cover`.
- In `src/index.css`: CSS variables `--safe-area-top` and `--safe-area-bottom` bound to `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- The top header (`safe-area-header`) avoids camera notches and Dynamic Islands.
- The bottom navigation bar (`safe-area-bottom-nav`) avoids the home indicator gesture swipe bar.

---

## 7. Offline Queue & Realtime Synchronization

- **Offline-First**: All data writes (tasks, notes, meetings, expenses) go to Dexie IndexedDB locally first.
- **Background Sync**: When online, `SyncContext` and `RealtimeSyncManager` drain pending mutations in `db.sync_queue` to Supabase.
- **No Compromise**: PWA Service Worker (`sw.js`) and Web app continue functioning 100% identically with zero code divergence.

---

## 8. What Does Not Work / Known Limitations

1. **Building iOS on Windows**:
   - iOS builds **cannot** be generated on Windows. Apple requires a Mac with Xcode. The `ios/` workspace is fully prepared and committed, but compilation must occur on a Mac.
2. **Google Cloud Console Custom URI Configuration**:
   - For Google OAuth redirect `com.yaswanth.hub://auth/callback` to work without Supabase proxying:
     - In **Google Cloud Console** > **APIs & Services** > **Credentials**, you must create an **Android** or **iOS** OAuth 2.0 Client ID matching package name `com.yaswanth.hub` and your keystore SHA-1 fingerprint.
     - *Recommended Alternative:* Use Supabase OAuth (configured in Settings), which handles webview and custom scheme redirects out-of-the-box.
3. **Web Bluetooth LE (Neo 1 Wearable) in Native WebViews**:
   - On desktop Chrome and Android Chrome (PWA), Web Bluetooth LE (`navigator.bluetooth`) is supported. However, in standard Android WebViews and iOS WKWebViews, `navigator.bluetooth` is disabled by the underlying OS browser engine. In native app mode, Neo 1 data ingestion is handled via audio transcript pasting and MCP cloud sync.
4. **Android 14 Exact Alarms**:
   - Android 14+ restricts exact alarms for battery optimization. While `USE_EXACT_ALARM` is declared in `AndroidManifest.xml`, on battery-saver mode Android may drift alarm firing by 1 to 5 minutes unless battery optimization is set to "Unrestricted" for Yashwanth Hub in Android Settings.
