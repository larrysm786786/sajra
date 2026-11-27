import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const bucket = "sajra-private-family-media";
type Json = Record<string, unknown>;
function respond(body: Json, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
function fail(message: string, status = 400) { return respond({ error: message }, status); }
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function uuid(value: unknown) { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function shuffle<T>(values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const random = new Uint32Array(1); crypto.getRandomValues(random);
    const j = random[0] % (i + 1); [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Method not allowed.", 405);
  const url = Deno.env.get("SUPABASE_URL"), anonKey = Deno.env.get("SUPABASE_ANON_KEY"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return fail("Feature service is not configured.", 500);
  let body: Json;
  try { body = await req.json(); } catch { return fail("Invalid request."); }
  const action = text(body.action, 64);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const authHeader = req.headers.get("Authorization") ?? "";

  async function staff(required: "manageFamilyFeatures" | "reviewMemberGallery" = "manageFamilyFeatures"): Promise<{ user: User; email: string } | Response> {
    if (!authHeader.startsWith("Bearer ")) return fail("Sign in to manage this feature.", 401);
    const caller = createClient(url, anonKey!, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error } = await caller.auth.getUser();
    if (error || !user?.email) return fail("Sign in to manage this feature.", 401);
    const email = user.email.trim().toLowerCase();
    const role = text(user.app_metadata?.role, 24);
    const { data: archive } = await admin.from("sajra_state").select("state").eq("id", "main").maybeSingle();
    const directoryUser = (archive?.state?.users ?? []).find((entry: { email?: string }) => entry.email?.trim().toLowerCase() === email);
    const isAdmin = role === "admin" || directoryUser?.role === "admin";
    const isEditor = role === "editor" || role === "contributor" || directoryUser?.role === "editor" || directoryUser?.role === "contributor";
    if (isAdmin) return { user, email };
    const permission = directoryUser?.permissions?.[required] === true;
    if (isEditor && permission) return { user, email };
    return fail("Your account does not have permission for this action.", 403);
  }

  async function audit(actor: { user: User; email: string }, feature: string, recordId: string | null, event: string, details: Json = {}) {
    await admin.from("family_feature_audit").insert({ feature, record_id: recordId, action: event, actor_id: actor.user.id, actor_email: actor.email, details });
  }

  async function getMember(memberId: number) {
    const { data, error } = await admin.from("sajra_state").select("state").eq("id", "main").maybeSingle();
    if (error || !data) return null;
    return (data.state?.members ?? []).find((member: { id?: number }) => member.id === memberId) ?? null;
  }

  async function signed(path: string | null, seconds = 3600) {
    if (!path) return null;
    const { data } = await admin.storage.from(bucket).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
  }

  async function requireMedia(path: string, startsWith: string) {
    if (!path.startsWith(startsWith) || path.includes("..")) return false;
    const slash = path.lastIndexOf("/");
    const { data } = await admin.storage.from(bucket).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 2 });
    return Boolean(data?.some((file) => file.name === path.slice(slash + 1)));
  }

  if (action === "create_upload") {
    const purpose = text(body.purpose, 32), mediaType = text(body.mediaType, 64);
    const memberId = Number(body.memberId);
    const allowed = purpose === "member_photo" ? ["image/jpeg", "image/png", "image/webp"] : ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav"];
    if (!allowed.includes(mediaType)) return fail("Unsupported media type.");
    let folder = "";
    if (purpose === "member_photo" && Number.isSafeInteger(memberId) && memberId > 0) folder = `member-gallery/${memberId}`;
    else if (purpose === "capsule") {
      const permission = await staff(); if (permission instanceof Response) return permission;
      folder = "capsules";
    } else return fail("Invalid upload purpose.");
    if (purpose === "member_photo" && !(await getMember(memberId))) return fail("Member profile not found.", 404);
    const extension = mediaType.split("/")[1].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) return fail("Could not prepare the secure upload.", 500);
    return respond({ path, token: data.token });
  }

  if (action === "list_capsules") {
    const authorization = authHeader.startsWith("Bearer ") ? await staff().catch(() => null) : null;
    const isStaff = authorization && !(authorization instanceof Response);
    let query = admin.from("family_memory_capsules").select("id,title,message,media_path,media_type,reveal_at,status,created_at").eq("status", "scheduled").order("reveal_at", { ascending: true });
    if (!isStaff) query = query.lte("reveal_at", new Date().toISOString());
    const { data, error } = await query;
    if (error) return fail("Could not load memory capsules.", 500);
    const capsules = await Promise.all((data ?? []).map(async (row) => ({ id: row.id, title: row.title, message: row.message, mediaPath: isStaff || new Date(row.reveal_at).getTime() <= Date.now() ? row.media_path : null, mediaType: row.media_type, revealAt: row.reveal_at, mediaUrl: isStaff || new Date(row.reveal_at).getTime() <= Date.now() ? await signed(row.media_path) : null })));
    return respond({ capsules });
  }

  if (action === "create_capsule") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const title = text(body.title, 120), message = text(body.message, 5000), revealAt = text(body.revealAt, 80), mediaPath = text(body.mediaPath, 300) || null, mediaType = text(body.mediaType, 64) || null;
    const timestamp = Date.parse(revealAt);
    if (!title || (!message && !mediaPath) || !Number.isFinite(timestamp) || timestamp <= Date.now()) return fail("Add a title and message/photo/audio, and choose a future reveal date.");
    if (mediaPath && !(await requireMedia(mediaPath, "capsules/"))) return fail("Uploaded media could not be verified.");
    const { data, error } = await admin.from("family_memory_capsules").insert({ title, message: message || null, media_path: mediaPath, media_type: mediaType, reveal_at: new Date(timestamp).toISOString(), created_by: actor.user.id }).select().single();
    if (error) return fail("Could not save the memory capsule.", 500);
    await audit(actor, "capsule", data.id, "scheduled", { title, revealAt: data.reveal_at });
    return respond({ capsule: { id: data.id, title, message: data.message, mediaPath, mediaType, revealAt: data.reveal_at } });
  }

  if (action === "cancel_capsule") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    if (!uuid(body.id)) return fail("Invalid capsule.");
    const { error } = await admin.from("family_memory_capsules").update({ status: "cancelled" }).eq("id", body.id).gt("reveal_at", new Date().toISOString());
    if (error) return fail("Could not cancel the capsule.", 500);
    await audit(actor, "capsule", String(body.id), "cancelled");
    return respond({ ok: true });
  }

  if (action === "list_member_photos") {
    const memberId = Number(body.memberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) return fail("Invalid member.");
    const { data, error } = await admin.from("member_gallery_submissions").select("id,member_id,caption,media_path,status,submitted_at").eq("member_id", memberId).eq("status", "approved").order("submitted_at", { ascending: false });
    if (error) return fail("Could not load this member's gallery.", 500);
    return respond({ photos: await Promise.all((data ?? []).map(async (row) => ({ id: row.id, memberId: row.member_id, caption: row.caption, mediaPath: row.media_path, status: row.status, submittedAt: row.submitted_at, mediaUrl: await signed(row.media_path) }))) });
  }

  if (action === "submit_member_photo") {
    const memberId = Number(body.memberId), mediaPath = text(body.mediaPath, 300), caption = text(body.caption, 300);
    if (!Number.isSafeInteger(memberId) || memberId <= 0 || !mediaPath.startsWith(`member-gallery/${memberId}/`) || !(await getMember(memberId))) return fail("Invalid member photo submission.");
    if (!(await requireMedia(mediaPath, `member-gallery/${memberId}/`))) return fail("Uploaded photo could not be verified.");
    const { data, error } = await admin.from("member_gallery_submissions").insert({ member_id: memberId, caption: caption || null, media_path: mediaPath }).select().single();
    if (error) return fail("Could not send the photo for review.", 500);
    return respond({ submission: { id: data.id, memberId, caption: data.caption, mediaPath, status: "pending", submittedAt: data.submitted_at } });
  }

  if (action === "list_pending_member_photos") {
    const actor = await staff("reviewMemberGallery"); if (actor instanceof Response) return actor;
    const { data, error } = await admin.from("member_gallery_submissions").select("id,member_id,caption,media_path,status,submitted_at").eq("status", "pending").order("submitted_at", { ascending: true });
    if (error) return fail("Could not load pending photos.", 500);
    return respond({ photos: await Promise.all((data ?? []).map(async (row) => ({ id: row.id, memberId: row.member_id, caption: row.caption, mediaPath: row.media_path, status: row.status, submittedAt: row.submitted_at, mediaUrl: await signed(row.media_path) }))) });
  }

  if (action === "count_pending_member_photos") {
    const actor = await staff("reviewMemberGallery"); if (actor instanceof Response) return actor;
    const { count, error } = await admin.from("member_gallery_submissions").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (error) return fail("Could not count pending member photos.", 500);
    return respond({ count: count ?? 0 });
  }

  if (action === "review_member_photo") {
    const actor = await staff("reviewMemberGallery"); if (actor instanceof Response) return actor;
    const id = body.id, decision = body.decision;
    if (!uuid(id) || !["approved", "rejected"].includes(String(decision))) return fail("Invalid review decision.");
    const { error } = await admin.from("member_gallery_submissions").update({ status: decision, reviewed_by: actor.user.id, reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
    if (error) return fail("Could not save the photo review.", 500);
    await audit(actor, "member_gallery", String(id), String(decision));
    return respond({ ok: true });
  }

  if (action === "create_competition") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const title = text(body.title, 120), description = text(body.description, 1000), prize = text(body.prize, 240);
    const startsAt = Date.parse(String(body.startsAt ?? "")), endsAt = Date.parse(String(body.endsAt ?? ""));
    const durationSeconds = Number(body.durationSeconds), questions = Array.isArray(body.questions) ? body.questions : [];
    if (!title || !prize || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt || !Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 3600 || questions.length < 3 || questions.length > 50) return fail("Check the competition details and add between 3 and 50 questions.");
    const cleanQuestions = questions.map((raw, index) => {
      const q = raw as Json, choices = Array.isArray(q.choices) ? q.choices.map((v) => text(v, 180)).filter(Boolean).slice(0, 6) : [];
      const correctIndex = Number(q.correctIndex);
      if (!text(q.prompt, 500) || choices.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) throw new Error(`Question ${index + 1} is incomplete.`);
      return { prompt: text(q.prompt, 500), choices, correct_index: correctIndex, position: index };
    });
    const { data, error } = await admin.from("quiz_competitions").insert({ title, description: description || null, prize, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), duration_seconds: durationSeconds, status: "open", created_by: actor.user.id }).select().single();
    if (error) return fail("Could not create the quiz competition.", 500);
    const { error: questionError } = await admin.from("quiz_questions").insert(cleanQuestions.map((q) => ({ ...q, competition_id: data.id })));
    if (questionError) { await admin.from("quiz_competitions").delete().eq("id", data.id); return fail("Could not save the competition questions.", 500); }
    await audit(actor, "quiz", data.id, "published", { title, prize, questionCount: cleanQuestions.length });
    return respond({ competition: { id: data.id, title, description, prize, startsAt: data.starts_at, endsAt: data.ends_at, durationSeconds, status: data.status } });
  }

  if (action === "list_competitions") {
    const actor = await staff().catch(() => null); const isStaff = actor && !(actor instanceof Response);
    let query = admin.from("quiz_competitions").select("id,title,description,prize,starts_at,ends_at,duration_seconds,status,winner_entry_id").order("created_at", { ascending: false });
    if (!isStaff) query = query.in("status", ["open", "closed", "completed"]);
    const { data, error } = await query;
    if (error) return fail("Could not load quiz competitions.", 500);
    const competitions = await Promise.all((data ?? []).map(async (row) => {
      const { count } = await admin.from("quiz_entries").select("id", { count: "exact", head: true }).eq("competition_id", row.id);
      return { id: row.id, title: row.title, description: row.description, prize: row.prize, startsAt: row.starts_at, endsAt: row.ends_at, durationSeconds: row.duration_seconds, status: row.status, winnerEntryId: row.winner_entry_id, entries: count ?? 0 };
    }));
    return respond({ competitions });
  }

  if (action === "enter_quiz") {
    const competitionId = body.competitionId, memberId = Number(body.memberId);
    if (!uuid(competitionId) || !Number.isSafeInteger(memberId) || memberId <= 0) return fail("Choose your Sajra member profile.");
    const [competition, member] = await Promise.all([admin.from("quiz_competitions").select("id,status,starts_at,ends_at").eq("id", competitionId).maybeSingle(), getMember(memberId)]);
    if (!competition.data || competition.data.status !== "open" || Date.now() < Date.parse(competition.data.starts_at) || Date.now() > Date.parse(competition.data.ends_at)) return fail("This quiz is not open for entries.");
    if (!member) return fail("Member profile not found.");
    const { data, error } = await admin.from("quiz_entries").insert({ competition_id: competitionId, member_id: memberId, member_name: member.name }).select("id,member_id,member_name,score,submitted_at").single();
    if (error?.code === "23505") {
      const { data: existing } = await admin.from("quiz_entries").select("id,member_id,member_name,score,submitted_at").eq("competition_id", competitionId).eq("member_id", memberId).maybeSingle();
      if (existing && !existing.submitted_at) return respond({ entry: { id: existing.id, memberId: existing.member_id, memberName: existing.member_name, score: existing.score, submittedAt: existing.submitted_at } });
      return fail("This member has already submitted an attempt.", 409);
    }
    if (error) return fail("Could not register your entry.", 500);
    return respond({ entry: { id: data.id, memberId: data.member_id, memberName: data.member_name, score: data.score, submittedAt: data.submitted_at } });
  }

  if (action === "start_quiz") {
    const competitionId = body.competitionId, memberId = Number(body.memberId);
    if (!uuid(competitionId) || !Number.isSafeInteger(memberId)) return fail("Invalid quiz entry.");
    const { data: competition } = await admin.from("quiz_competitions").select("status,starts_at,ends_at,duration_seconds").eq("id", competitionId).maybeSingle();
    if (!competition || competition.status !== "open" || Date.now() < Date.parse(competition.starts_at) || Date.now() > Date.parse(competition.ends_at)) return fail("This competition is not open right now.");
    const { data: entry } = await admin.from("quiz_entries").select("id,started_at,submitted_at,presented_questions").eq("competition_id", competitionId).eq("member_id", memberId).maybeSingle();
    if (!entry || entry.submitted_at) return fail("No unused entry is available for this member.", 409);
    if (entry.started_at && Array.isArray(entry.presented_questions)) {
      const saved = entry.presented_questions as Array<{ id: string; prompt: string; choices: string[]; optionOrder: number[] }>;
      return respond({ entryId: entry.id, startedAt: entry.started_at, durationSeconds: competition.duration_seconds, questions: saved.map(({ optionOrder: _order, ...question }) => question) });
    }
    const { data: questionRows, error } = await admin.from("quiz_questions").select("id,prompt,choices,position").eq("competition_id", competitionId).order("position");
    if (error || !questionRows?.length) return fail("Could not load the quiz questions.", 500);
    const questions = shuffle(questionRows.map((row) => {
      const optionOrder = shuffle((row.choices as string[]).map((_, index) => index));
      return { id: row.id, prompt: row.prompt, choices: optionOrder.map((index) => (row.choices as string[])[index]), optionOrder };
    }));
    const startedAt = new Date().toISOString();
    const { data: startedEntry, error: updateError } = await admin.from("quiz_entries").update({ started_at: startedAt, presented_questions: questions }).eq("id", entry.id).is("started_at", null).select("id").maybeSingle();
    if (updateError || !startedEntry) return fail("This member has already started their quiz attempt.", 409);
    return respond({ entryId: entry.id, startedAt, durationSeconds: competition.duration_seconds, questions: questions.map(({ optionOrder: _optionOrder, ...question }) => question) });
  }

  if (action === "submit_quiz") {
    const competitionId = body.competitionId, entryId = body.entryId, memberId = Number(body.memberId);
    if (!uuid(competitionId) || !uuid(entryId) || !Number.isSafeInteger(memberId) || !Array.isArray(body.answers)) return fail("Invalid quiz response.");
    const { data: entry } = await admin.from("quiz_entries").select("id,started_at,submitted_at,presented_questions").eq("id", entryId).eq("competition_id", competitionId).eq("member_id", memberId).maybeSingle();
    const { data: competition } = await admin.from("quiz_competitions").select("status,ends_at,duration_seconds").eq("id", competitionId).maybeSingle();
    if (!entry || !entry.started_at || entry.submitted_at || !competition || competition.status !== "open" || Date.now() > Date.parse(competition.ends_at)) return fail("This quiz attempt is no longer available.", 409);
    if (Date.now() > Date.parse(entry.started_at) + competition.duration_seconds * 1000 + 15000) return fail("The quiz time has ended.", 409);
    const presented = entry.presented_questions as Array<{ id: string; optionOrder: number[] }>;
    const answers = body.answers as Array<{ questionId: string; choiceIndex: number }>;
    if (answers.length !== presented.length) return fail("Submit an answer for every question.");
    const validAnswers = new Map<string, number>();
    for (const answer of answers) {
      if (!uuid(answer.questionId) || !Number.isInteger(answer.choiceIndex) || answer.choiceIndex < 0 || answer.choiceIndex > 5 || validAnswers.has(answer.questionId)) return fail("Invalid quiz answer.");
      validAnswers.set(answer.questionId, answer.choiceIndex);
    }
    const { data: keys, error } = await admin.from("quiz_questions").select("id,correct_index").eq("competition_id", competitionId);
    if (error) return fail("Could not verify the quiz answers.", 500);
    const correct = new Map((keys ?? []).map((q) => [q.id, q.correct_index]));
    let score = 0;
    for (const question of presented) {
      const picked = validAnswers.get(question.id), originalIndex = picked === undefined ? undefined : question.optionOrder[picked];
      if (originalIndex !== undefined && correct.get(question.id) === originalIndex) score += 1;
    }
    const { data: updated, error: updateError } = await admin.from("quiz_entries").update({ answers: body.answers, score, submitted_at: new Date().toISOString() }).eq("id", entryId).is("submitted_at", null).select("id,member_id,member_name,score,submitted_at").maybeSingle();
    if (updateError || !updated) return fail("Could not save the quiz result.", 500);
    return respond({ entry: { id: updated.id, memberId: updated.member_id, memberName: updated.member_name, score: updated.score, submittedAt: updated.submitted_at } });
  }

  if (action === "set_competition_status") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.id, status = body.status;
    if (!uuid(id) || !["open", "closed", "completed", "cancelled"].includes(String(status))) return fail("Invalid competition status.");
    const { error } = await admin.from("quiz_competitions").update({ status }).eq("id", id);
    if (error) return fail("Could not update the competition.", 500);
    await audit(actor, "quiz", String(id), String(status));
    return respond({ ok: true });
  }

  if (action === "list_quiz_entries") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.competitionId; if (!uuid(id)) return fail("Invalid competition.");
    const { data, error } = await admin.from("quiz_entries").select("id,member_id,member_name,score,submitted_at").eq("competition_id", id).order("score", { ascending: false, nullsFirst: false }).order("submitted_at", { ascending: true });
    if (error) return fail("Could not load quiz entries.", 500);
    return respond({ entries: (data ?? []).map((row) => ({ id: row.id, memberId: row.member_id, memberName: row.member_name, score: row.score, submittedAt: row.submitted_at })) });
  }

  if (action === "choose_quiz_winner") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.competitionId; if (!uuid(id)) return fail("Invalid competition.");
    const { data: competition } = await admin.from("quiz_competitions").select("status,ends_at").eq("id", id).maybeSingle();
    if (!competition || Date.now() < Date.parse(competition.ends_at)) return fail("Wait until the competition has ended before choosing a winner.");
    const { data: entries, error } = await admin.from("quiz_entries").select("id,member_id,member_name,score,submitted_at").eq("competition_id", id).not("submitted_at", "is", null).order("score", { ascending: false });
    if (error || !entries?.length) return fail("There are no completed entries to select from.");
    const highest = entries[0].score ?? 0;
    const tied = entries.filter((entry) => (entry.score ?? 0) === highest);
    const winner = tied[crypto.getRandomValues(new Uint32Array(1))[0] % tied.length];
    const { error: updateError } = await admin.from("quiz_competitions").update({ winner_entry_id: winner.id, status: "completed" }).eq("id", id);
    if (updateError) return fail("Could not save the winner.", 500);
    await audit(actor, "quiz", String(id), "winner_selected", { winnerEntryId: winner.id, score: winner.score, tiedCount: tied.length });
    return respond({ winner: { id: winner.id, memberId: winner.member_id, memberName: winner.member_name, score: winner.score, submittedAt: winner.submitted_at } });
  }

  if (action === "create_committee") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const title = text(body.title, 120), description = text(body.description, 1000), amount = Number(body.installmentAmount), startsOn = text(body.startsOn, 10);
    if (!title || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || startsOn < new Date().toISOString().slice(0, 10)) return fail("Check the committee name, installment, and future start date.");
    const { data, error } = await admin.from("savings_committees").insert({ title, description: description || null, installment_amount: amount, starts_on: startsOn, created_by: actor.user.id }).select().single();
    if (error) return fail("Could not create the committee.", 500);
    await audit(actor, "committee", data.id, "created", { title, installmentAmount: amount, startsOn });
    return respond({ committee: { id: data.id, title, description, installmentAmount: amount, startsOn, status: data.status, participants: [], cycle: [] } });
  }

  if (action === "join_committee") {
    const id = body.committeeId, memberId = Number(body.memberId);
    if (!uuid(id) || !Number.isSafeInteger(memberId) || memberId <= 0) return fail("Choose your Sajra member profile.");
    const [committee, member] = await Promise.all([admin.from("savings_committees").select("status").eq("id", id).maybeSingle(), getMember(memberId)]);
    if (!committee.data || committee.data.status !== "enrolling" || !member) return fail("This committee is not accepting participants.");
    const { error } = await admin.from("savings_committee_members").insert({ committee_id: id, member_id: memberId, member_name: member.name });
    if (error) return fail(error.code === "23505" ? "This member has already joined." : "Could not join the committee.", error.code === "23505" ? 409 : 500);
    return respond({ ok: true });
  }

  if (action === "review_committee_member") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.committeeId, memberId = Number(body.memberId), decision = body.decision;
    if (!uuid(id) || !Number.isSafeInteger(memberId) || !["approved", "rejected"].includes(String(decision))) return fail("Invalid participant review.");
    const { error } = await admin.from("savings_committee_members").update({ status: decision }).eq("committee_id", id).eq("member_id", memberId).is("draw_number", null);
    if (error) return fail("Could not update the participant.", 500);
    await audit(actor, "committee", String(id), `participant_${decision}`, { memberId });
    return respond({ ok: true });
  }

  if (action === "lock_committee") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.committeeId; if (!uuid(id)) return fail("Invalid committee.");
    const { data: draw, error } = await admin.rpc("lock_savings_committee", { p_committee_id: id });
    if (error || !Array.isArray(draw)) return fail(error?.message || "Could not lock the committee draw.", 409);
    await audit(actor, "committee", String(id), "random_order_locked", { participants: draw });
    return respond({ ok: true });
  }

  if (action === "set_committee_status") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.committeeId, status = body.status;
    if (!uuid(id) || !["paused", "completed", "cancelled"].includes(String(status))) return fail("Invalid committee status.");
    const { error } = await admin.from("savings_committees").update({ status }).eq("id", id);
    if (error) return fail("Could not update the committee.", 500);
    await audit(actor, "committee", String(id), String(status));
    return respond({ ok: true });
  }

  if (action === "mark_committee_contribution") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.committeeId, memberId = Number(body.memberId), cycle = Number(body.cycleNumber), received = body.received === true;
    if (!uuid(id) || !Number.isSafeInteger(memberId) || !Number.isInteger(cycle) || cycle < 1) return fail("Invalid contribution record.");
    const { error } = await admin.from("savings_committee_contributions").update({ status: received ? "received" : "pending", received_at: received ? new Date().toISOString() : null, confirmed_by: received ? actor.user.id : null }).eq("committee_id", id).eq("member_id", memberId).eq("cycle_number", cycle);
    if (error) return fail("Could not update the contribution.", 500);
    await audit(actor, "committee", String(id), received ? "contribution_received" : "contribution_reopened", { memberId, cycle });
    return respond({ ok: true });
  }

  if (action === "mark_committee_payout") {
    const actor = await staff(); if (actor instanceof Response) return actor;
    const id = body.committeeId, cycle = Number(body.cycleNumber), paid = body.paid === true;
    if (!uuid(id) || !Number.isInteger(cycle) || cycle < 1) return fail("Invalid payout record.");
    if (paid) {
      const [{ count: expected }, { count: received }] = await Promise.all([
        admin.from("savings_committee_members").select("id", { count: "exact", head: true }).eq("committee_id", id).eq("status", "approved"),
        admin.from("savings_committee_contributions").select("id", { count: "exact", head: true }).eq("committee_id", id).eq("cycle_number", cycle).eq("status", "received")
      ]);
      if (!expected || received !== expected) return fail("Mark every participant's installment as received before confirming this payout.", 409);
    }
    const { error } = await admin.from("savings_committee_payouts").update({ status: paid ? "paid" : "pending", paid_at: paid ? new Date().toISOString() : null, confirmed_by: paid ? actor.user.id : null }).eq("committee_id", id).eq("cycle_number", cycle);
    if (error) return fail("Could not update the payout.", 500);
    await audit(actor, "committee", String(id), paid ? "payout_paid" : "payout_reopened", { cycle });
    return respond({ ok: true });
  }

  if (action === "list_committees") {
    const actor = await staff().catch(() => null); const isStaff = actor && !(actor instanceof Response);
    let query = admin.from("savings_committees").select("id,title,description,installment_amount,starts_on,status").order("created_at", { ascending: false });
    if (!isStaff) query = query.in("status", ["enrolling", "active", "completed"]);
    const { data, error } = await query;
    if (error) return fail("Could not load committees.", 500);
    const committees = await Promise.all((data ?? []).map(async (row) => {
      const { data: participants } = await admin.from("savings_committee_members").select("member_id,member_name,status,draw_number").eq("committee_id", row.id).order("draw_number", { ascending: true, nullsFirst: true });
      const approvedParticipants = (participants ?? []).filter((p) => p.status === "approved");
      const safeParticipants = isStaff ? (participants ?? []).map((p) => ({ memberId: p.member_id, memberName: p.member_name, status: p.status, drawNumber: p.draw_number })) : [];
      let cycle: SavingsCommittee["cycle"] = [];
      if (isStaff && row.status !== "enrolling") {
        const [{ data: contributions }, { data: payouts }] = await Promise.all([
          admin.from("savings_committee_contributions").select("member_id,cycle_number,amount,status").eq("committee_id", row.id),
          admin.from("savings_committee_payouts").select("member_id,member_name,cycle_number,status").eq("committee_id", row.id)
        ]);
        cycle = (payouts ?? []).map((p) => ({ cycleNumber: p.cycle_number, memberId: p.member_id, memberName: p.member_name, amount: Number(p.amount), paid: (contributions ?? []).filter((c) => c.cycle_number === p.cycle_number).length === approvedParticipants.length && (contributions ?? []).filter((c) => c.cycle_number === p.cycle_number).every((c) => c.status === "received"), payoutPaid: p.status === "paid", contributions: (contributions ?? []).filter((c) => c.cycle_number === p.cycle_number).map((c) => ({ memberId: c.member_id, amount: Number(c.amount), received: c.status === "received" })) }));
      }
      return { id: row.id, title: row.title, description: row.description, installmentAmount: Number(row.installment_amount), startsOn: row.starts_on, status: row.status, participants: safeParticipants, cycle };
    }));
    return respond({ committees });
  }

  return fail("Unsupported family feature action.");
});
