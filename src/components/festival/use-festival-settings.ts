import { getRouteApi } from "@tanstack/react-router";
import { DEFAULT_FESTIVAL_SETTINGS, type FestivalSettings } from "@/lib/festival";

// The switch is loaded once by the root route (routes/__root.tsx loader), so it is in the server-rendered HTML:
// the festive UI never pops in late. If it could not be loaded, the sale counts as OFF and the site is normal.
const rootApi = getRouteApi("__root__");

export function useFestivalSettings(): FestivalSettings {
  const data = rootApi.useLoaderData() as { festival?: FestivalSettings } | undefined;
  return data?.festival ?? DEFAULT_FESTIVAL_SETTINGS;
}
