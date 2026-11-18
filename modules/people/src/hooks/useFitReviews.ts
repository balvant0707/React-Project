// Ported 1:1 from COMPASS (app/src/hooks/useFitReviews.ts).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { FitContext, FitReview, FitReviewItem, FitStatusRow, RequirementItem } from "../lib/positions";
import { usePermissions } from "@rbp/core";

// The requirements of one version as a list (the database filters by who may read the version).
export function useVersionRequirements(versionId: string | undefined) {
  return useQuery({
    queryKey: ["positions", "requirements", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("job_description_requirements")
        .select("id, phrase_id, sort_order, requirement_phrases(text)")
        .eq("version_id", versionId!)
        .order("sort_order");
      if (error) throw error;
      return ((data ?? []) as unknown as { id: string; phrase_id: string; sort_order: number; requirement_phrases: { text: string } | null }[])
        .map((r): RequirementItem => ({ id: r.id, phrase_id: r.phrase_id, sort_order: r.sort_order, text: r.requirement_phrases?.text ?? "" }));
    },
  });
}

// The learned requirement texts, for the suggestions while typing (a small table).
export function useRequirementPhrases() {
  return useQuery({
    queryKey: ["positions", "requirement-phrases"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("requirement_phrases").select("id, text").order("text").limit(2000);
      if (error) throw error;
      return (data ?? []) as { id: string; text: string }[];
    },
  });
}

export function useFitContext(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["fit", "context", userId],
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("position_fit_context", { p_user: userId });
      if (error) throw error;
      return data as FitContext;
    },
  });
}

// All reviews of one person, newest first, each with its items (the policy hides them from everybody without view rights).
export function useFitReviews(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["fit", "reviews", userId],
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("position_fit_reviews")
        .select("id, user_id, reviewed_on, next_review_on, result, note, measure, measure_due_on, measure_status, positions, created_by_user_id, position_fit_review_items(id, review_id, phrase_id, rating, comment, requirement_phrases(text))")
        .eq("user_id", userId!)
        .order("reviewed_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Raw = Omit<FitReview, "items"> & { position_fit_review_items: (Omit<FitReviewItem, "text"> & { requirement_phrases: { text: string } | null })[] };
      return ((data ?? []) as unknown as Raw[]).map(({ position_fit_review_items, ...r }): FitReview => ({
        ...r,
        items: position_fit_review_items.map(({ requirement_phrases, ...i }) => ({ ...i, text: requirement_phrases?.text ?? "" })),
      }));
    },
  });
}

// One row per person who holds a position, with the status of the latest review (filtered by access in the database).
export function useFitStatus(enabled = true) {
  return useQuery({
    queryKey: ["fit", "status"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("position_fit_status").select("*").limit(5000);
      if (error) throw error;
      return (data ?? []) as FitStatusRow[];
    },
  });
}

// Mirrors the database check roughly (it decides): the literals fit_reviews.view|edit.* in any scope. canViewOthers:
// the overview tab is for people who may see reviews of others (team / all), not for view.own alone.
export function useFitAccess() {
  const { hasAny } = usePermissions();
  const canEdit = hasAny("fit_reviews.edit.");
  const canViewOthers = canEdit || hasAny("fit_reviews.view.reports") || hasAny("fit_reviews.view.all");
  return { canView: canViewOthers || hasAny("fit_reviews.view.own"), canViewOthers, canEdit };
}

export function useFitRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["fit"] });
}
