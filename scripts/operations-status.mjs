const base =
  process.env.OPS_URL ?? "https://github-discover.ypyt147.workers.dev";
if (!process.env.CRON_SECRET)
  throw new Error(
    "CRON_SECRET must be configured locally; never paste it into chat.",
  );
const response = await fetch(`${base}/api/internal/sync`, {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  redirect: "error",
  signal: AbortSignal.timeout(20000),
});
if (!response.ok)
  throw new Error(`Operation status request failed (${response.status})`);
console.log(JSON.stringify(await response.json(), null, 2));
