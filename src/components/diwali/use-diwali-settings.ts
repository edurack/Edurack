import { getRouteApi } from "@tanstack/react-router";
import { DEFAULT_DIWALI_SETTINGS, type DiwaliSettings } from "@/lib/diwali";

// The switch is loaded once by the root route (routes/__root.tsx loader), so it is in the server-rendered HTML:
// the Diwali UI never pops in late. If it could not be loaded, the sale counts as OFF and the site is normal.
const rootApi = getRouteApi("__root__");

export function useDiwaliSettings(): DiwaliSettings {
  const data = rootApi.useLoaderData() as { diwali?: DiwaliSettings } | undefined;
  return data?.diwali ?? DEFAULT_DIWALI_SETTINGS;
}
