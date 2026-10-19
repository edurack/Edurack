// src/routes/leaderboard.tsx  →  /leaderboard   (signed-in students; private, so not indexed)
import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import { LeaderboardView } from "@/components/leaderboard-view";

export const Route = createFileRoute("/leaderboard")({
  head: () => noindexHead("Weekly PYQ leaderboard", "Who solved the most previous-year questions this week."),
  component: LeaderboardView,
});
