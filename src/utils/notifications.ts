/**
 * notifications.ts
 *
 * Daily expense reminder via @notifee/react-native.
 *
 * ANDROID 16 (API 36) NOTES:
 * ─────────────────────────
 * • USE_EXACT_ALARM — Google Play restricts this to alarm clock / calendar apps.
 *   Do NOT declare it in the manifest for a budget app or the Play review will fail.
 *
 * • SCHEDULE_EXACT_ALARM — user-granted permission, denied by default since Android 14.
 *   We do NOT declare it in the manifest either; instead we ask at runtime via
 *   notifee.openAlarmPermissionSettings() so the user consciously decides.
 *
 * • Without exact alarm permission the notification is delivered by WorkManager,
 *   which is inexact (±15 min) but works fine for a daily expense reminder.
 *   With the permission it uses AlarmManager SET_EXACT_AND_ALLOW_WHILE_IDLE
 *   and fires even in Doze mode at the exact minute.
 *
 * The code checks at schedule-time which mode to use and picks automatically.
 */

import notifee, {
  TriggerType,
  RepeatFrequency,
  AndroidImportance,
  AndroidNotificationSetting,
  AuthorizationStatus,
  AlarmType,
  TimestampTrigger,
} from '@notifee/react-native';

const CHANNEL_ID = 'budget-reminder';
const NOTIFICATION_ID = 'daily-reminder';

async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Daily Expense Reminder',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
}

/**
 * Timestamp (ms) for the next occurrence of HH:MM in local time.
 * If that time has already passed today, returns tomorrow's occurrence.
 */
function nextOccurrence(hour: number, minute: number): number {
  const now = new Date();
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

/**
 * Check whether the SCHEDULE_EXACT_ALARM permission is currently granted.
 * On Android < 12 this always returns true (no permission needed).
 */
async function hasExactAlarmPermission(): Promise<boolean> {
  const s = await notifee.getNotificationSettings();
  return (
    s.android.alarm === AndroidNotificationSetting.ENABLED ||
    s.android.alarm === AndroidNotificationSetting.NOT_SUPPORTED // pre-Android-12
  );
}

/**
 * Request notification permission (Android 13+) and optionally the exact alarm
 * permission (Android 12+).
 *
 * Returns:
 *   'granted'       — all permissions granted, exact alarms will work
 *   'inexact'       — notification permission OK, but exact alarm not granted;
 *                     notifications will still fire (just ±15 min inexact)
 *   'denied'        — notification permission denied; can't show any notification
 */
export async function requestPermissions(): Promise<'granted' | 'inexact' | 'denied'> {
  // Step 1: notification permission (Android 13+ / iOS)
  const settings = await notifee.requestPermission();
  const notifGranted =
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;

  if (!notifGranted) {
    return 'denied';
  }

  // Step 2: exact alarm permission — ask but don't block on it
  const alarmOk = await hasExactAlarmPermission();
  if (!alarmOk) {
    // Send user to the "Alarms & reminders" page in system settings.
    // This is non-blocking — the user may or may not grant it.
    await notifee.openAlarmPermissionSettings();
    // Re-check after they return
    const granted = await hasExactAlarmPermission();
    return granted ? 'granted' : 'inexact';
  }

  return 'granted';
}

/**
 * Schedule (or reschedule) the daily reminder.
 * Cancels any pre-existing trigger so there is never a duplicate.
 * Automatically uses exact or inexact depending on what the device allows.
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
): Promise<void> {
  await ensureChannel();
  await notifee.cancelTriggerNotification(NOTIFICATION_ID);

  const useExact = await hasExactAlarmPermission();

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: nextOccurrence(hour, minute),
    repeatFrequency: RepeatFrequency.DAILY,
    ...(useExact && {
      alarmManager: {
        type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
      },
    }),
  };

  await notifee.createTriggerNotification(
    {
      id: NOTIFICATION_ID,
      title: '💰 Budget Tracker',
      body: "Don't forget to log today's expenses!",
      android: {
        channelId: CHANNEL_ID,
        pressAction: {id: 'default'},
        smallIcon: 'ic_launcher', // uses the app icon — no custom icon needed
        importance: AndroidImportance.HIGH,
      },
    },
    trigger,
  );
}

/** Cancel the daily reminder */
export async function cancelDailyReminder(): Promise<void> {
  await notifee.cancelTriggerNotification(NOTIFICATION_ID);
}
