import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCloudProjectDocument, type CloudProjectVersion } from "./cloudProjectFormat";
import { projectReviewDraft, projectReviewWallet, type ProjectReviewComment, type ProjectReviewDraft, type ProjectReviewInvitation, type ProjectReviewMember, type ProjectReviewRole } from "./cloudProjectReview";

export function cloudProjectReviewApi(client: SupabaseClient, wallet: string, conflict: (message: string) => Error) {
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw (error.code === "PT409" || error.code === "40001") ? conflict(error.message) : new Error(error.message);
    return data as T;
  }
  return {
    inbox: () => rpc<ProjectReviewInvitation[]>("editor_cloud_review_inbox"),
    members: (id: string) => rpc<ProjectReviewMember[]>("editor_cloud_review_members", { p_id: id }),
    share: (id: string, member: string, role: ProjectReviewRole | "none", expectedState: number) => {
      const recipient = projectReviewWallet(member);
      if (recipient === wallet) throw new Error("The owner already has project access");
      return rpc<ProjectReviewMember>("editor_cloud_review_share", { p_id: id, p_member: recipient, p_role: role, p_expected_state: expectedState });
    },
    accept: (project: ProjectReviewInvitation) => rpc<ProjectReviewMember>("editor_cloud_review_accept", { p_owner: project.ownerWallet, p_id: project.projectId, p_expected_state: project.stateVersion }),
    leave: (project: ProjectReviewInvitation) => {
      if (project.memberWallet !== wallet) throw new Error("Project invitation changed");
      return rpc<ProjectReviewMember>("editor_cloud_review_leave", { p_owner: projectReviewWallet(project.ownerWallet), p_id: project.projectId, p_expected_state: project.stateVersion });
    },
    async load(owner: string, id: string, revision?: number): Promise<CloudProjectVersion> {
      const sourceOwner = projectReviewWallet(owner);
      const result = await rpc<CloudProjectVersion>("editor_cloud_review_load", { p_owner: sourceOwner, p_id: id, p_revision: revision ?? null });
      return { ...result, document: parseCloudProjectDocument(result.document, sourceOwner) };
    },
    comments: (owner: string, id: string) => rpc<ProjectReviewComment[]>("editor_cloud_review_comments", { p_owner: projectReviewWallet(owner), p_id: id }),
    comment: (owner: string, id: string, requestId: string, draft: ProjectReviewDraft) => {
      const value = projectReviewDraft(draft);
      return rpc<ProjectReviewComment>("editor_cloud_review_comment", { p_owner: projectReviewWallet(owner), p_id: id, p_comment_id: requestId,
        p_revision: value.revision, p_time: value.atSeconds, p_body: value.body, p_clip_id: value.clipId, p_parent_id: value.parentId, p_assignee: value.assigneeWallet });
    },
    resolve: (comment: ProjectReviewComment, resolved: boolean) => rpc<ProjectReviewComment>("editor_cloud_review_resolve", {
      p_owner: comment.ownerWallet, p_id: comment.projectId, p_comment_id: comment.id, p_expected_state: comment.stateVersion, p_resolved: resolved }),
  };
}
