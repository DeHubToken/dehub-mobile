import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudProjectReviewApi } from "./cloudProjectReviewApi";
import { projectReviewWallet } from "./cloudProjectReview";
import { walletScopedClient } from "../../services/supabase";
import { CloudProjectConflict, CLOUD_PROJECT_BUCKET, parseCloudProjectDocument, type CloudProjectDocument, type CloudProjectSaved, type CloudProjectSummary, type CloudProjectVersion } from "./cloudProjectFormat";

export { CloudProjectConflict } from "./cloudProjectFormat";

/** Each call stays pinned to its selected account and requires a signed session. */
export function cloudProjectApi(address: string) {
  const wallet = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new Error("Sign in to access cloud projects");
  const client = walletScopedClient(wallet) as unknown as SupabaseClient;
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      if ((error.code === "PT409" || error.code === "40001")) throw new CloudProjectConflict(error.message);
      throw new Error(error.message);
    }
    return data as T;
  }
  return {
    review: cloudProjectReviewApi(client, wallet, message => new CloudProjectConflict(message)),
    editing: {
      async load(owner: string, id: string): Promise<CloudProjectVersion> {
        const sourceOwner = projectReviewWallet(owner);
        const result = await rpc<CloudProjectVersion>("editor_cloud_edit_load", { p_owner: sourceOwner, p_id: id });
        return { ...result, document: parseCloudProjectDocument(result.document, sourceOwner) };
      },
      save: (owner: string, id: string, document: CloudProjectDocument, revision: number, requestId: string) =>
        rpc<CloudProjectSaved>("editor_cloud_edit_save", { p_owner: projectReviewWallet(owner), p_id: id, p_document: parseCloudProjectDocument(document, projectReviewWallet(owner)), p_expected_revision: revision, p_request_id: requestId }),
      async prepareMedia(owner: string, projectId: string, id: string, size: number, extension: string) {
        const slot = await rpc<{path: string}>("editor_cloud_prepare_shared_media", { p_owner: projectReviewWallet(owner), p_project: projectId, p_id: id, p_size: size, p_extension: extension });
        const { data, error } = await client.storage.from(CLOUD_PROJECT_BUCKET).createSignedUploadUrl(slot.path, { upsert: false });
        if (error || !data) throw new Error(error?.message || "Shared media upload could not be prepared");
        return data;
      },
    },
    list: (trashed = false) => rpc<CloudProjectSummary[]>(trashed ? "editor_cloud_list_trash" : "editor_cloud_list"),
    setTrash: (project: CloudProjectSummary, trashed: boolean) => rpc<CloudProjectSummary>("editor_cloud_set_trash", { p_id: project.projectId, p_expected_revision: project.revision, p_expected_state: project.stateVersion ?? 0, p_trashed: trashed }),
    history: (id: string) => rpc<CloudProjectSummary[]>("editor_cloud_history", { p_id: id }),
    async load(id: string, revision?: number): Promise<CloudProjectVersion> {
      const result = await rpc<CloudProjectVersion>("editor_cloud_load", { p_id: id, p_revision: revision ?? null });
      return { ...result, document: parseCloudProjectDocument(result.document, wallet) };
    },
    save(id: string, document: CloudProjectDocument, expectedRevision: number, requestId: string) {
      return rpc<CloudProjectSaved>("editor_cloud_save", { p_id: id, p_document: parseCloudProjectDocument(document, wallet), p_expected_revision: expectedRevision, p_request_id: requestId });
    },
    restore(id: string, revision: number, expectedRevision: number, requestId: string) {
      return rpc<CloudProjectSaved>("editor_cloud_restore", { p_id: id, p_revision: revision, p_expected_revision: expectedRevision, p_request_id: requestId });
    },
    async prepareMedia(id: string, size: number, extension: string) {
      const slot = await rpc<{ path: string }>("editor_cloud_prepare_media", { p_id: id, p_size: size, p_extension: extension });
      const { data, error } = await client.storage.from(CLOUD_PROJECT_BUCKET).createSignedUploadUrl(slot.path, { upsert: false });
      if (error || !data) throw new Error(error?.message || "Cloud media upload could not be prepared");
      return data;
    },
    async sourceUrl(path: string, sourceOwner = wallet) {
      const owner = projectReviewWallet(sourceOwner);
      if (!path.startsWith(`${owner}/`) || path.includes("..")) throw new Error("Invalid cloud media path");
      const { data, error } = await client.storage.from(CLOUD_PROJECT_BUCKET).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw new Error(error?.message || "Cloud media is unavailable");
      return data.signedUrl;
    },
  };
}
