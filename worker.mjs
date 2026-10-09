import handler from "./.open-next/worker.js";
import { observeRequest, observeScheduled } from "./src/lib/observability.ts";
import { protectRequest } from "./src/lib/request-protection.ts";

const worker = {
  fetch(request, env, ctx) {
    return observeRequest(
      request,
      env,
      () => protectRequest(request) ?? handler.fetch(request, env, ctx),
    );
  },
  scheduled(_event, env, ctx) {
    // Service binding avoids exposing an admin endpoint without authentication.
    ctx.waitUntil(
      observeScheduled(env, async () => {
        if (!env.CRON_SECRET)
          throw Object.assign(new Error(), { code: "configMissing" });
        const response = await env.WORKER_SELF_REFERENCE.fetch(
          new Request(`${env.APP_URL}/api/internal/sync`, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
          }),
        );
        if (!response.ok)
          throw Object.assign(new Error(), {
            code: "scheduledFailed",
            status: response.status,
            relatedRequestId: response.headers.get("x-request-id"),
          });
        return response.headers.get("x-request-id");
      }),
    );
  },
};
export default worker;
