import { getSupabaseClient } from "./supabase";

export type MemoryCapsule = { id: string; title: string; message: string | null; mediaPath: string | null; mediaType: string | null; revealAt: string; mediaUrl?: string | null };
export type MemberPhotoSubmission = { id: string; memberId: number; caption: string | null; mediaPath: string; status: "pending" | "approved" | "rejected"; submittedAt: string; mediaUrl?: string | null };
export type Competition = { id: string; title: string; description: string | null; prize: string; startsAt: string; endsAt: string; durationSeconds: number; status: "draft" | "open" | "closed" | "completed" | "cancelled"; winnerEntryId?: string | null; entries?: number };
export type QuizQuestion = { id?: string; prompt: string; choices: string[]; correctIndex: number };
export type PublicQuizQuestion = { id: string; prompt: string; choices: string[] };
export type QuizEntry = { id: string; memberId: number; memberName: string; score: number | null; submittedAt: string | null };
export type SavingsCommittee = { id: string; title: string; description: string | null; installmentAmount: number; startsOn: string; status: "enrolling" | "active" | "completed" | "paused" | "cancelled"; participants: Array<{ memberId: number; memberName: string; status: string; drawNumber: number | null }>; cycle: Array<{ cycleNumber: number; memberId: number; memberName: string; amount: number; paid: boolean; payoutPaid: boolean; contributions: Array<{memberId:number;amount:number;received:boolean}> }> };

async function invoke(action: string, payload: Record<string, unknown> = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Sajra needs an online Supabase connection for this feature.");
  const { data, error } = await supabase.functions.invoke("sajra-family-features", { body: { action, ...payload } });
  if (error) {
    const response = (error as { context?: Response }).context;
    const result = response?.json ? await response.json().catch(() => null) : null;
    throw new Error(result?.error ? String(result.error) : error.message);
  }
  if (!data || typeof data !== "object") throw new Error("The Sajra feature service returned an invalid response.");
  if (data.error) throw new Error(String(data.error));
  return data as Record<string, unknown>;
}

export async function uploadFamilyFeatureMedia(file: File, purpose: "capsule" | "member_photo", memberId?: number): Promise<{ path: string; type: string }> {
  const mediaType = file.type.toLowerCase();
  const allowed = purpose === "capsule"
    ? ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav"]
    : ["image/jpeg", "image/png", "image/webp"];
  const maxBytes = mediaType.startsWith("audio/") ? 10 * 1024 * 1024 : 8 * 1024 * 1024;
  if (!allowed.includes(mediaType)) throw new Error(purpose === "capsule" ? "Choose a JPG, PNG, WebP photo or supported audio file." : "Choose a JPG, PNG or WebP photo.");
  if (file.size > maxBytes) throw new Error(`File is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const upload = await invoke("create_upload", { purpose, memberId, mediaType, fileName: file.name });
  const path = String(upload.path ?? "");
  const token = String(upload.token ?? "");
  if (!path || !token) throw new Error("Could not prepare a secure media upload.");
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Sajra is not connected.");
  const { error } = await supabase.storage.from("sajra-private-family-media").uploadToSignedUrl(path, token, file, { contentType: mediaType, upsert: false });
  if (error) throw new Error(error.message);
  return { path, type: mediaType };
}

export async function listCapsules() { return (await invoke("list_capsules")).capsules as MemoryCapsule[]; }
export async function saveCapsule(input: { title: string; message: string; revealAt: string; mediaPath?: string | null; mediaType?: string | null }) {
  return (await invoke("create_capsule", input)).capsule as MemoryCapsule;
}
export async function cancelCapsule(id: string) { await invoke("cancel_capsule", { id }); }

export async function listMemberPhotos(memberId: number) { return (await invoke("list_member_photos", { memberId })).photos as MemberPhotoSubmission[]; }
export async function submitMemberPhoto(input: { memberId: number; caption: string; mediaPath: string }) { return (await invoke("submit_member_photo", input)).submission as MemberPhotoSubmission; }
export async function listPendingMemberPhotos() { return (await invoke("list_pending_member_photos")).photos as MemberPhotoSubmission[]; }
export async function countPendingMemberPhotos() { return Number((await invoke("count_pending_member_photos")).count ?? 0); }
export async function reviewMemberPhoto(id: string, decision: "approved" | "rejected") { await invoke("review_member_photo", { id, decision }); }

export async function listCompetitions() { return (await invoke("list_competitions")).competitions as Competition[]; }
export async function createCompetition(input: { title: string; description: string; prize: string; startsAt: string; endsAt: string; durationSeconds: number; questions: QuizQuestion[] }) {
  return (await invoke("create_competition", input)).competition as Competition;
}
export async function setCompetitionStatus(id: string, status: "open" | "closed" | "completed" | "cancelled") { await invoke("set_competition_status", { id, status }); }
export async function enterQuiz(input: { competitionId: string; memberId: number; memberName: string }) { return (await invoke("enter_quiz", input)).entry as QuizEntry; }
export async function startQuiz(input: { competitionId: string; memberId: number }) { return (await invoke("start_quiz", input)) as { entryId: string; startedAt: string; questions: PublicQuizQuestion[]; durationSeconds: number };
}
export async function submitQuiz(input: { competitionId: string; memberId: number; entryId: string; answers: Array<{ questionId: string; choiceIndex: number }> }) {
  return (await invoke("submit_quiz", input)).entry as QuizEntry;
}
export async function listQuizEntries(competitionId: string) { return (await invoke("list_quiz_entries", { competitionId })).entries as QuizEntry[]; }
export async function chooseQuizWinner(competitionId: string) { return (await invoke("choose_quiz_winner", { competitionId })).winner as QuizEntry; }

export async function listCommittees() { return (await invoke("list_committees")).committees as SavingsCommittee[]; }
export async function createCommittee(input: { title: string; description: string; installmentAmount: number; startsOn: string }) {
  return (await invoke("create_committee", input)).committee as SavingsCommittee;
}
export async function joinCommittee(input: { committeeId: string; memberId: number; memberName: string }) { await invoke("join_committee", input); }
export async function reviewCommitteeMember(input: { committeeId: string; memberId: number; decision: "approved" | "rejected" }) { await invoke("review_committee_member", input); }
export async function lockCommittee(committeeId: string) { await invoke("lock_committee", { committeeId }); }
export async function setCommitteeStatus(committeeId: string, status: "paused" | "completed" | "cancelled") { await invoke("set_committee_status", { committeeId, status }); }
export async function markCommitteeContribution(input: { committeeId: string; memberId: number; cycleNumber: number; received: boolean }) { await invoke("mark_committee_contribution", input); }
export async function markCommitteePayout(input: { committeeId: string; cycleNumber: number; paid: boolean }) { await invoke("mark_committee_payout", input); }
