// Ported 1:1 from COMPASS (app/src/hooks/usePeople.ts).
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { PERSON_COLUMNS, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";
import { usePermissions } from "@rbp/core";

// Everybody in the directory, also people without a login. A company-sized list, loaded once.
export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("users").select(PERSON_COLUMNS).order("name");
      if (error) throw error;
      return (data ?? []) as PersonRow[];
    },
  });
}

type PersonPrivate = { birth_date: string | null; exit_date: string | null };

// The full birth date and the exit date are private: only people.edit can read them (everybody else sees users.has_left).
export function usePersonPrivate(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["person-private", userId],
    enabled: enabled && !!userId,
    queryFn: async (): Promise<PersonPrivate> => {
      const { data, error } = await supabaseClient.from("person_private").select("birth_date, exit_date").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return { birth_date: (data?.birth_date as string | null) ?? null, exit_date: (data?.exit_date as string | null) ?? null };
    },
  });
}

// HR (people.edit) edits personal data and photos; an admin needs the literal through a role too.
export const useCanEditPeople = () => usePermissions().has("people.edit");
