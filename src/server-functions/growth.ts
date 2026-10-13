// Admin → Growth Hub (for the COO / marketing). Read-only numbers; logic in lib/growth-core.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireTeamAdmin } from "@/lib/team-core";
import { buildGrowthSnapshot } from "@/lib/growth-core";
import type { GrowthSnapshot } from "@/lib/growth-types";

export const getGrowthSnapshot = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<GrowthSnapshot> => {
    await requireTeamAdmin(data.token);
    return buildGrowthSnapshot();
  });
