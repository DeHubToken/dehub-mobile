/**
 * Stage search
 * ============
 * Recorded stages whose title, description or host matches. Shared by the
 * Stages chart on the Music tab and the Music tab's search.
 *
 * @module libs/stage-search
 */

import { supabase } from "../services/supabase";
import type { AudioSpace } from "../hooks/useStages";

export type RankedStage = AudioSpace & { total_listens?: number | null };

export const STAGE_FIELDS = "id,host_wallet_address,host_username,host_avatar,title,description,status,channel_name,listener_count,speaker_count,started_at,ended_at,created_at,recording_url,scheduled_at,cover_image_url,short_id,total_listens";

/** Recorded stages whose title, description or host matches, most listened first. */
export async function searchStageRecordings(query: string): Promise<RankedStage[]> {
  // PostgREST reads , ( ) as filter syntax and % * as wildcards.
  const term = query.replace(/[,()%*\\]/g, " ").trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from("audio_spaces")
    .select(STAGE_FIELDS)
    .eq("status", "ended")
    .not("recording_url", "is", null)
    .neq("recording_url", "")
    .or(`title.ilike.%${term}%,description.ilike.%${term}%,host_username.ilike.%${term}%`)
    .order("total_listens", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) throw error;
  return (data as unknown as RankedStage[]) || [];
}
