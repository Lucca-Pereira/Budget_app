# Budget Tracker — React Native 0.83.1

Personal budget tracking app for Android. Dark-themed, offline-first, no account needed.

---

## Features

- **Dashboard** — monthly overview, per-category spend vs budget with progress bars, rollover credits shown inline
- **Add Expense** — native date picker (Spanish locale), recurring expenses with day-of-month config
- **History** — search by note/category, filter chips, month navigation, tap to edit, long-press or bin to delete
- **Charts** — donut chart of spending by category + 6-month bar chart trend, built with react-native-svg (no heavy deps)
- **Settings** — income, currency, daily reminder config, rollover per category, CSV export via Share sheet

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20.19.4 LTS |
| JDK | 17 |
| Android Studio | Latest |
| Android SDK Platform | 35 |
| Android Build-Tools | 35 |

**Environment variables:**
```
ANDROID_HOME = C:\Users\<you>\AppData\Local\Android\Sdk
PATH += %ANDROID_HOME%\platform-tools
PATH += %ANDROID_HOME%\emulator
```

---

## First-time setup

### Step 1 — Scaffold the native Android shell
```bash
cd E:\
npx @react-native-community/cli@latest init BudgetAppShell --version 0.83.1 --skip-git-init
```

### Step 2 — Copy the android/ folder
```bash
xcopy /E /I E:\BudgetAppShell\android E:\BudgetApp\android
```

### Step 3 — Install dependencies
```bash
cd E:\BudgetApp
npm install
```

### Step 4 — Clean up
```bash
rd /s /q E:\BudgetAppShell
```

---

## Running on your phone

1. Enable Developer Options (tap Build Number 7 times)
2. Enable USB Debugging
3. Connect phone via USB
4. `adb devices` — verify it shows your device
5. Terminal 1: `npx react-native start`
6. Terminal 2: `npx react-native run-android`

---

## Notifications setup (required after scaffolding)

Notifications are fully implemented in `src/utils/notifications.ts`. The only manual
step is a rebuild after `npm install` — Notifee is a native package.

### No manifest changes needed for Android 16

On Android 16 (and 13–15), `SCHEDULE_EXACT_ALARM` is denied by default and must be
granted by the user at runtime — not declared in the manifest. `USE_EXACT_ALARM` is
restricted by Google Play to alarm clock / calendar apps only.

**Do not add any alarm permission to `AndroidManifest.xml`** — the code handles everything
at runtime via `notifee.getNotificationSettings()` and `notifee.openAlarmPermissionSettings()`.

### How permissions work end-to-end

1. User taps the 🔕 toggle in Settings.
2. `requestPermissions()` runs:
   - Asks for notification permission (the standard Android 13 prompt).
   - Then opens **Settings → Apps → Special app access → Alarms & reminders** so the
     user can optionally grant exact alarm access.
   - If the user skips the exact alarm screen, notifications still work — just ±15 min
     inexact via WorkManager. The UI confirms which mode is active.
3. User sets a time and taps **Save Settings**.
4. `scheduleDailyReminder(h, min)` runs:
   - Cancels any existing trigger (no duplicates).
   - Computes the next occurrence of that time in local time (Spanish/CET timezone is
     handled correctly because `new Date(y, m, d, h, min)` uses local time).
   - If exact alarm permission is granted → uses `AlarmManager SET_EXACT_AND_ALLOW_WHILE_IDLE`
     (fires even in Doze mode at the exact minute).
   - If not granted → uses Notifee's default WorkManager path (no permission needed,
     fires within ~15 minutes of the set time).
5. The confirmation alert tells you which mode is active and, if inexact, gives
   the exact path to grant the permission later.

### Rebuild after install

```bash
npx react-native run-android
```

Metro restart alone (`npx react-native start`) is not enough — Notifee is a native
module and needs a full Android build after `npm install`.

---

## Project structure

```
src/
├── App.tsx                   # 5-tab navigation
├── types.ts                  # TypeScript interfaces
├── theme.ts                  # Colours, spacing, typography
├── context/
│   └── BudgetContext.tsx     # Global state + AsyncStorage + rollover logic
├── utils/
│   ├── storage.ts            # AsyncStorage helpers
│   └── helpers.ts            # Date, formatting, CSV, rollover, recurring utils
└── screens/
    ├── DashboardScreen.tsx   # Monthly summary + category cards with rollover
    ├── AddExpenseScreen.tsx  # Native date picker + recurring config
    ├── HistoryScreen.tsx     # Search + filter + edit modal + delete
    ├── ChartsScreen.tsx      # Donut + 6-month bar chart (react-native-svg)
    └── SettingsScreen.tsx    # Income/currency/notifications/export/categories
```

---

## Troubleshooting

**`adb devices` shows "unauthorized"** — unlock phone and allow USB debugging prompt.

**hermes-android not found** — use `--version 0.83.1` not `0.83.0`.

**Metro errors** — `npx react-native start --reset-cache`

**Date picker not showing** — `@react-native-community/datetimepicker` needs a rebuild after install (`npx react-native run-android`, not just Metro restart).
