import handler from "./.open-next/worker.js";

const worker = {
  fetch: handler.fetch,
  scheduled(_event, env, ctx) {
    // Service binding avoids exposing an admin endpoint without authentication.
    ctx.waitUntil(
      (async () => {
        if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not configured");
        const response = await env.WORKER_SELF_REFERENCE.fetch(
          new Request(`${env.APP_URL}/api/internal/sync`, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
          }),
        );
        if (!response.ok)
          throw new Error(`Repository sync failed: ${response.status}`);
      })(),
    );
  },
};
export default worker;
