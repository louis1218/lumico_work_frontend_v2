// Switch features on or off without touching the rest of the app.
// Inspecting trackers is paused for the repair job. Set to true to bring it back.
export const INSPECT_ENABLED = false;

// This job only replaces panels. Set to true to let staff choose "Fixed" as well, and to show fixed
// and replaced as separate counts in the reports.
export const FIXED_ENABLED = false;

// The solar farm staff are working at. Saved with every record, so reports can tell sites apart.
// Change both lines to move everyone to another site (phones switch over the next time the app opens).
export const SITE = "manildra";
export const SITE_NAME = "Manildra";

// Staff already logged in at an older site move to the current one without logging in again.
// Runs once when the app starts, before the saved login is read.
try {
  const saved = localStorage.getItem("userSession");
  if (saved) {
    const session = JSON.parse(saved);
    if (session && session.site !== SITE) localStorage.setItem("userSession", JSON.stringify({ ...session, site: SITE }));
  }
} catch {
  /* no saved login, or storage blocked: nothing to move */
}
