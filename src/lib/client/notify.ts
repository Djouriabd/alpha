export type NotificationAccess = NotificationPermission | 'unsupported';

const SOUNDS = {
  rate: '/sounds/notification.mp3',
  alert: '/sounds/token2.mp3',
} as const;

const players = new Map<keyof typeof SOUNDS, HTMLAudioElement>();

export function notificationAccess(): NotificationAccess {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestNotificationAccess(): Promise<NotificationAccess> {
  if (notificationAccess() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function playSound(sound: keyof typeof SOUNDS) {
  try {
    let player = players.get(sound);
    if (!player) {
      player = new Audio(SOUNDS[sound]);
      player.preload = 'auto';
      players.set(sound, player);
    }
    player.currentTime = 0;
    // Browsers reject playback until the visitor has interacted with the page once.
    void player.play().catch(() => undefined);
  } catch {
    // Audio is optional.
  }
}

/** `tag` lets the browser collapse duplicates when several Alpha tabs report the same event. */
export function notify(title: string, body: string, options: { sound: keyof typeof SOUNDS; tag: string }) {
  playSound(options.sound);
  if (notificationAccess() !== 'granted') return;
  try {
    const notification = new Notification(title, { body, tag: options.tag, icon: '/logo.png' });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}
