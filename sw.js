const SUPABASE_URL = 'https://bihjzpebagywsgwakvde.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Sd9qIw8j9MPjleM9lHSNsA_dy2NvUf_';
const NOTIFICATION_HOUR = 9;
const NOTIFICATION_MINUTE = 0;
const ALARM_TAG = 'daily-reminder-9am';

let dailyAlarmTimer = null;

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(from, to) {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((b - a) / 86400000);
}

function nextEventDate(eventDate) {
  const today = parseDate(todayStr());
  const [y, m, d] = eventDate.split('-').map(Number);
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return `${next.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysUntilEvent(eventDate) {
  return daysBetween(todayStr(), nextEventDate(eventDate));
}

async function supabaseFetch(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
}

async function buildNotificationContent() {
  const [tasks, events] = await Promise.all([
    supabaseFetch('tasks'),
    supabaseFetch('events'),
  ]);

  const today = todayStr();
  const todayTasks = (tasks || []).filter((t) => !t.done && t.date === today);
  const lines = [`📋 ${todayTasks.length} ამოცანა დღეს`];

  const upcoming = (events || [])
    .map((ev) => ({ ...ev, daysLeft: daysUntilEvent(ev.date) }))
    .filter((ev) => ev.daysLeft >= 0 && ev.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  for (const ev of upcoming) {
    if (ev.daysLeft === 1 && ev.type === 'birthday') {
      lines.push(`🎂 ხვალ: ${ev.text}`);
    } else if (ev.daysLeft === 0) {
      lines.push(`📅 დღეს: ${ev.text}`);
    } else if (ev.daysLeft === 1) {
      lines.push(`📅 ხვალ: ${ev.text}`);
    } else {
      lines.push(`📅 ${ev.daysLeft} დღეში: ${ev.text}`);
    }
  }

  return {
    title: '📋 რემაინდერი',
    body: lines.join('\n'),
  };
}

async function showDailyNotification() {
  try {
    const { title, body } = await buildNotificationContent();
    await self.registration.showNotification(title, {
      body,
      tag: ALARM_TAG,
      renotify: true,
      lang: 'ka',
      data: { url: './' },
    });
  } catch (err) {
    console.error('[SW] Notification error:', err);
    await self.registration.showNotification('📋 რემაინდერი', {
      body: '📋 შეხსენება — გახსენით აპი დეტალებისთვის',
      tag: ALARM_TAG,
      lang: 'ka',
      data: { url: './' },
    });
  }
}

function msUntilNext9AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(NOTIFICATION_HOUR, NOTIFICATION_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function scheduleDailyAlarm() {
  if (dailyAlarmTimer) clearTimeout(dailyAlarmTimer);
  const ms = msUntilNext9AM();
  console.log('[SW] Next notification in', Math.round(ms / 60000), 'minutes');
  dailyAlarmTimer = setTimeout(async () => {
    await showDailyNotification();
    scheduleDailyAlarm();
  }, ms);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(scheduleDailyAlarm());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => scheduleDailyAlarm())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SCHEDULE_DAILY') {
    scheduleDailyAlarm();
  }
  if (event.data.type === 'SHOW_NOW') {
    event.waitUntil(showDailyNotification());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
