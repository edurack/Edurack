// Admin -> Growth ops. Read-only numbers for the team; logic in lib/growth-ops-core.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireTeamAdmin } from "@/lib/team-core";
import { buildGrowthOps } from "@/lib/growth-ops-core";
import type { GrowthOps } from "@/lib/growth-ops-types";

export const getGrowthOps = createServerFn({ method: "POST" })
  .validator((data: { token: string; days?: number }) => data)
  .handler(async ({ data }): Promise<GrowthOps> => {
    await requireTeamAdmin(data.token);
    return buildGrowthOps(data.days === 30 ? 30 : 7);
  });
