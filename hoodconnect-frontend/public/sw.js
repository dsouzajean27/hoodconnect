// public/sw.js — place in your frontend/public/ folder
self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", e  => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}

  const isEmergency = data.type === "emergency";

  const options = {
    body:               data.body || "New activity on HoodConnect",
    icon:               "/logo192.png",
    badge:              "/logo192.png",
    tag:                data.type || "general",
    data:               { url: data.url || "/dashboard" },
    requireInteraction: isEmergency,   // stays on screen until dismissed
    silent:             !isEmergency,  // only emergency makes sound
    vibrate:            isEmergency ? [300, 100, 300, 100, 300] : undefined,
    actions: isEmergency ? [
      { action: "view",    title: "📍 View on Maps" },
      { action: "dismiss", title: "Dismiss"         },
    ] : [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "HoodConnect", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else           { self.clients.openWindow(url); }
    })
  );
});
