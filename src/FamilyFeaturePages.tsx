import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Member } from "./types";
import {
  cancelCapsule, chooseQuizWinner, createCommittee, createCompetition, deleteCompetition, enterQuiz, joinCommittee,
  listCapsules, listCommittees, listCompetitions, listMemberPhotos, listPendingMemberPhotos, listQuizEntries,
  lockCommittee, markCommitteeContribution, markCommitteePayout, reviewCommitteeMember,
  reviewMemberPhoto, saveCapsule, setCommitteeStatus, setCompetitionStatus, startQuiz,
  submitMemberPhoto, submitQuiz, uploadFamilyFeatureMedia
} from "./familyFeatures";
import type { Competition, MemberPhotoSubmission, MemoryCapsule, PublicQuizQuestion, SavingsCommittee } from "./familyFeatures";

type Props = { page: "capsules" | "quiz" | "committees"; members: Member[]; isStaff: boolean; canManage: boolean; canReviewGallery: boolean; memberId?: number; language: "en" | "ur" };
const copy = {
  en: {
    capsules:"Family Memory Capsules", quiz:"Family Prize Quiz", committees:"Family Committee",
    capsuleIntro:"Save a family message, photo or audio and choose when everyone can see it.",
    quizIntro:"Take part in a short quiz about Sajra and family history. Sajra members and guests can both join.",
    committeeIntro:"Track monthly contributions and the agreed payout order. Payments are arranged separately by participants.",
    future:"Save a memory for a future family moment", title:"Title", message:"Message", reveal:"Reveal date and time", media:"Add a photo or audio (optional)", save:"Save memory",
    locked:"This memory will be revealed on", noCapsules:"No family memories have been scheduled yet.", cancel:"Cancel scheduled memory",
    gallery:"Family photo gallery", galleryIntro:"Browse approved family photos or send a photo to the admin/editor for review.", closeGallery:"Close gallery", zoomIn:"Zoom in", zoomOut:"Zoom out", zoomReset:"Reset zoom", previousPhoto:"Previous photo", nextPhoto:"Next photo", noMemberPhoto:"No approved photos yet. You can submit one for review.",
    uploadPhoto:"Choose a family photo", caption:"Photo caption (optional)", submit:"Send photo for review", pending:"Photo sent to the admin/editor for review.", emptyGallery:"No approved photos in this member’s gallery yet.",
    competition:"Create a prize quiz", prize:"Prize", start:"Quiz opens", end:"Quiz closes", duration:"Time allowed (minutes)",
    questions:"Quiz questions (one per line: question | option 1 | option 2 | correct option number)",
    questionsHelp:"Add at least 3 questions. Use 1 for the first correct option, 2 for the second, and so on.", minimumQuestions:"Please add at least 3 complete questions before publishing.", create:"Publish quiz", enter:"Join quiz", play:"Start quiz", send:"Submit answers", winner:"Select winner", deleteQuiz:"Delete quiz", deleteQuizConfirm:"Delete this quiz and all its entries? This cannot be undone.",
    searchMembers:"Search Sajra members by name or ID", chooseMember:"Select a member from the results", otherToggle:"I’m not in the Sajra family tree", otherName:"Participant name", otherPlaceholder:"Enter your full name", noMemberMatches:"No matching Sajra members. You can join as a guest.", selectedMember:"Selected Sajra member", guestLabel:"Guest participant", changeParticipant:"Choose a Sajra member instead", quizOpensAt:"Entries open", quizClosed:"The entry period for this quiz has ended.", noQuiz:"No prize quizzes are available right now.",
    committee:"Create a family savings committee", amount:"Monthly contribution per person (₹)", starts:"First monthly cycle", description:"How this committee will work", createCommittee:"Open committee for requests", join:"Request to join", lock:"Approve participants and draw the payout order", approve:"Approve", reject:"Reject", cycle:"Monthly payout schedule", contributions:"Mark contribution received", payout:"Mark payout paid", pause:"Pause committee", emptyCommittee:"No family committees are open right now.", members:"Participant", state:"Status", score:"Score", draw:"Payout order", refresh:"Refresh", loading:"Loading…", error:"Action could not be completed."
  },
  ur: {
    capsules:"خاندانی یادوں کے کیپسول", quiz:"خاندانی انعامی کوئز", committees:"خاندانی کمیٹی",
    capsuleIntro:"خاندانی پیغام، تصویر یا آڈیو محفوظ کریں اور اسے دکھانے کی تاریخ مقرر کریں۔",
    quizIntro:"سجرا اور خاندانی تاریخ کے بارے میں کوئز میں حصہ لیں۔ خاندان کے افراد اور دوسرے مہمان بھی شامل ہو سکتے ہیں۔",
    committeeIntro:"ماہانہ قسطوں اور طے شدہ ادائیگی کی ترتیب کا ریکارڈ رکھیں۔ رقم کی ادائیگی شرکاء الگ سے کریں گے۔",
    future:"مستقبل کے خاندانی موقع کے لیے یاد محفوظ کریں", title:"عنوان", message:"پیغام", reveal:"دکھانے کی تاریخ اور وقت", media:"تصویر یا آڈیو شامل کریں (اختیاری)", save:"یاد محفوظ کریں",
    locked:"یہ یاد اس تاریخ کو دکھائی جائے گی", noCapsules:"ابھی کوئی خاندانی یاد مقرر نہیں کی گئی۔", cancel:"مقررہ یاد منسوخ کریں",
    gallery:"خاندانی تصاویر کی گیلری", galleryIntro:"منظور شدہ خاندانی تصاویر دیکھیں یا جائزے کے لیے تصویر بھیجیں۔", closeGallery:"گیلری بند کریں", zoomIn:"تصویر بڑی کریں", zoomOut:"تصویر چھوٹی کریں", zoomReset:"اصل سائز دکھائیں", previousPhoto:"پچھلی تصویر", nextPhoto:"اگلی تصویر", noMemberPhoto:"ابھی منظور شدہ تصاویر نہیں ہیں۔ آپ جائزے کے لیے تصویر بھیج سکتے ہیں۔",
    uploadPhoto:"خاندانی تصویر منتخب کریں", caption:"تصویر کا کیپشن (اختیاری)", submit:"جائزے کے لیے تصویر بھیجیں", pending:"تصویر ایڈمن/ایڈیٹر کے جائزے کے لیے بھیج دی گئی ہے۔", emptyGallery:"اس رکن کی گیلری میں ابھی منظور شدہ تصاویر نہیں ہیں۔",
    competition:"انعامی کوئز بنائیں", prize:"انعام", start:"کوئز شروع ہونے کا وقت", end:"کوئز بند ہونے کا وقت", duration:"کوئز کے لیے وقت (منٹ)",
    questions:"سوالات (ہر سطر: سوال | جواب 1 | جواب 2 | درست جواب کا نمبر)", questionsHelp:"کم از کم 3 مکمل سوالات شامل کریں۔ پہلے درست جواب کے لیے 1، دوسرے کے لیے 2 لکھیں۔", minimumQuestions:"کوئز شائع کرنے سے پہلے کم از کم 3 مکمل سوالات شامل کریں۔", create:"کوئز شائع کریں",
    enter:"کوئز میں شامل ہوں", play:"کوئز شروع کریں", send:"جوابات جمع کریں", winner:"فاتح منتخب کریں", deleteQuiz:"کوئز حذف کریں", deleteQuizConfirm:"کیا یہ کوئز اور اس کے تمام اندراجات حذف کر دیں؟ یہ عمل واپس نہیں ہو سکتا۔",
    searchMembers:"سجرا کے ارکان کو نام یا آئی ڈی سے تلاش کریں", chooseMember:"نتائج میں سے رکن منتخب کریں", otherToggle:"میں سجرا فیملی ٹری میں شامل نہیں ہوں", otherName:"شرکاء کا نام", otherPlaceholder:"اپنا پورا نام لکھیں", noMemberMatches:"سجرا کا رکن نہیں ملا۔ مہمان کے طور پر شامل ہو سکتے ہیں۔", selectedMember:"منتخب رکن", guestLabel:"مہمان شریک", changeParticipant:"سجرا کا رکن منتخب کریں", quizOpensAt:"شرکت شروع ہوگی", quizClosed:"اس کوئز میں شرکت کا وقت ختم ہو چکا ہے۔", noQuiz:"اس وقت کوئی انعامی کوئز دستیاب نہیں۔",
    committee:"خاندانی بچت کمیٹی بنائیں", amount:"ہر شریک کی ماہانہ قسط (₹)", starts:"پہلے ماہانہ دور کی تاریخ", description:"کمیٹی کے طریقۂ کار کی تفصیل", createCommittee:"شرکت کی درخواستیں کھولیں", join:"شامل ہونے کی درخواست", lock:"شرکاء منظور کرکے ادائیگی کی ترتیب نکالیں", approve:"منظور کریں", reject:"مسترد کریں", cycle:"ماہانہ ادائیگی کا شیڈول", contributions:"قسط وصول ہونے کی تصدیق کریں", payout:"ادائیگی کی تصدیق کریں", pause:"کمیٹی روکیں", emptyCommittee:"ابھی کوئی خاندانی کمیٹی کھلی نہیں ہے۔", members:"شریک", state:"حالت", score:"اسکور", draw:"ادائیگی کی ترتیب", refresh:"تازہ کریں", loading:"لوڈ ہو رہا ہے…", error:"یہ عمل مکمل نہیں ہو سکا۔"
  }
};

function toLocalInput(date: Date) { const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return d.toISOString().slice(0,16); }
function errMessage(e: unknown) { return e instanceof Error ? e.message : "Action could not be completed."; }

export function FamilyFeaturePages({ page, members, isStaff, canManage, canReviewGallery, memberId, language, onBroadcast, onAdminAlert }: Props & {onBroadcast?:(message:string)=>void;onAdminAlert?:(message:string)=>void}) {
  const c = copy[language]; const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const [capsules,setCapsules]=useState<MemoryCapsule[]>([]); const [competitions,setCompetitions]=useState<Competition[]>([]); const [committees,setCommittees]=useState<SavingsCommittee[]>([]);
  const [title,setTitle]=useState(""); const [message,setMessage]=useState(""); const [reveal,setReveal]=useState(toLocalInput(new Date(Date.now()+86400000))); const [file,setFile]=useState<File|null>(null); const [caption,setCaption]=useState("");
  const [prize,setPrize]=useState(""); const [description,setDescription]=useState(""); const [starts,setStarts]=useState(toLocalInput(new Date(Date.now()+3600000))); const [ends,setEnds]=useState(toLocalInput(new Date(Date.now()+86400000))); const [minutes,setMinutes]=useState("5"); const [questionText,setQuestionText]=useState("");
  const [amount,setAmount]=useState("1000"); const [committeeStart,setCommitteeStart]=useState(new Date().toISOString().slice(0,10)); const [selectedMember,setSelectedMember]=useState(String(memberId ?? members[0]?.id ?? ""));
  const [activeQuiz,setActiveQuiz]=useState<{competitionId:string;entryId:string;questions:PublicQuizQuestion[];durationSeconds:number}|null>(null); const [answers,setAnswers]=useState<Record<string,number>>({});
  async function load(){ setError(""); try { if(page==="capsules") setCapsules(await listCapsules()); if(page==="quiz") setCompetitions(await listCompetitions()); if(page==="committees") setCommittees(await listCommittees()); } catch(e){setError(errMessage(e));} }
  useEffect(()=>{ void load(); },[page,memberId]);
  async function act(fn:()=>Promise<unknown>, success=""){setBusy(true);setError("");setNotice("");try{await fn();setNotice(success);await load();}catch(e){setError(errMessage(e));}finally{setBusy(false);}}
  const sectionTitle = page==="capsules"?c.capsules:page==="quiz"?c.quiz:c.committees;
  const sectionIntro = page==="capsules"?c.capsuleIntro:page==="quiz"?c.quizIntro:c.committeeIntro;
  return <section className="section family-feature-page" dir={language==="ur"?"rtl":"ltr"}><div className="section-head"><div><span className="eyebrow">Apna Sajra</span><h1 className="section-title">{sectionTitle}</h1></div><button className="btn-ghost" onClick={()=>void load()}>{c.refresh}</button></div><p className="feature-intro">{sectionIntro}</p>
    {error?<p className="notice danger">{error}</p>:null}{notice?<p className="notice success">{notice}</p>:null}{busy?<p className="hint">{c.loading}</p>:null}
    {page==="capsules"?<>
      {canManage?<form className="card feature-form" onSubmit={e=>{e.preventDefault();void act(async()=>{let mediaPath:string|undefined,mediaType:string|undefined;if(file){const up=await uploadFamilyFeatureMedia(file,"capsule");mediaPath=up.path;mediaType=up.type;}await saveCapsule({title,message,revealAt:new Date(reveal).toISOString(),mediaPath,mediaType});setTitle("");setMessage("");setFile(null);},"Memory capsule scheduled.");}}><h2>{c.future}</h2><label>{c.title}<input required value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/></label><label>{c.message}<textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={5000}/></label><label>{c.reveal}<input required type="datetime-local" min={toLocalInput(new Date(Date.now()+60000))} value={reveal} onChange={e=>setReveal(e.target.value)}/></label><label>{c.media}<input type="file" accept="image/jpeg,image/png,image/webp,audio/*" onChange={e=>setFile(e.target.files?.[0]??null)}/></label><button className="btn" disabled={busy}>{c.save}</button></form>:null}
      {capsules.length? <div className="list">{capsules.map(x=><article className="card" key={x.id}><h3>{x.title}</h3><p>{x.message}</p>{x.mediaUrl?(x.mediaType?.startsWith("audio/")?<audio controls src={x.mediaUrl}/>:<img className="feature-photo" src={x.mediaUrl} alt={x.title}/>):null}<p className="tree-sub">{new Date(x.revealAt).getTime()>Date.now()?`${c.locked} ${new Date(x.revealAt).toLocaleString()}`:new Date(x.revealAt).toLocaleString()}</p>{canManage&&new Date(x.revealAt)>new Date()?<button className="btn-ghost danger" onClick={()=>void act(()=>cancelCapsule(x.id))}>{c.cancel}</button>:null}</article>)}</div>:<div className="empty">{c.noCapsules}</div>}
    </>:null}
    {page==="quiz"?<>
      {canManage?<form className="card feature-form" onSubmit={e=>{
        e.preventDefault();
        const questions=questionText.split(/\n+/).map(line=>line.split("|").map(x=>x.trim())).filter(a=>a.length>=4).map(a=>({prompt:a[0],choices:a.slice(1,-1),correctIndex:Number(a[a.length-1])-1}));
        if(questions.length<3){setError(c.minimumQuestions);return;}
        void act(async()=>{const created=await createCompetition({title,description,prize,startsAt:new Date(starts).toISOString(),endsAt:new Date(ends).toISOString(),durationSeconds:Number(minutes)*60,questions});await setCompetitionStatus(created.id,"open");onBroadcast?.(`Prize quiz is open: ${title}. Prize: ${prize}`);setTitle("");setQuestionText("");},"Prize quiz published. Visitors can join during the quiz window.");
      }}><h2>{c.competition}</h2><label>{c.title}<input required value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{c.description}<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><label>{c.prize}<input required value={prize} onChange={e=>setPrize(e.target.value)}/></label><label>{c.start}<input required type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>{c.end}<input required type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)}/></label><label>{c.duration}<input type="number" min="1" max="60" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label><label>{c.questions}<textarea required rows={5} value={questionText} onChange={e=>setQuestionText(e.target.value)} placeholder="Question | Option 1 | Option 2 | Correct answer number"/></label><p className="hint">{c.questionsHelp}</p><button className="btn">{c.create}</button></form>:null}
      {competitions.length?competitions.map(q=><CompetitionCard key={q.id} item={q} isStaff={isStaff} canManage={canManage} members={members} activeQuiz={activeQuiz} setActiveQuiz={setActiveQuiz} answers={answers} setAnswers={setAnswers} run={act} refresh={load} c={c}/>):<div className="empty">{c.noQuiz}</div>}
    </>:null}
    {page==="committees"?<>
      {canManage?<form className="card feature-form" onSubmit={e=>{e.preventDefault();void act(async()=>{await createCommittee({title,description,installmentAmount:Number(amount),startsOn:committeeStart});onBroadcast?.(`A family savings committee is open for enrollment: ${title}.`);setTitle("");},"Committee created. Members can request to join.");}}><h2>{c.committee}</h2><label>{c.title}<input required value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{c.description}<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><label>{c.amount}<input required type="number" min="1" step="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>{c.starts}<input required type="date" value={committeeStart} onChange={e=>setCommitteeStart(e.target.value)}/></label><button className="btn">{c.createCommittee}</button></form>:null}
      {committees.length?committees.map(x=><article className="card feature-card" key={x.id}><h2>{x.title}</h2><p>{x.description}</p><p><strong>₹{x.installmentAmount.toLocaleString()}</strong> · {x.status}</p>{!isStaff&&x.status==="enrolling"?<div className="actions-row"><select value={selectedMember} onChange={e=>setSelectedMember(e.target.value)}>{members.map(m=><option key={m.id} value={m.id}>{m.name} · {m.uniqueId||m.id}</option>)}</select><button className="btn" disabled={!selectedMember} onClick={()=>void act(()=>joinCommittee({committeeId:x.id,memberId:Number(selectedMember),memberName:members.find(m=>m.id===Number(selectedMember))?.name??""}).then(()=>onAdminAlert?.(`A member requested to join the committee ${x.title}.`)),"Join request sent for admin/editor review.")}>{c.join}</button></div>:null}
        {canManage&&x.status==="enrolling"?<><div className="list">{x.participants.filter(p=>p.status==="pending").map(p=><div className="card" key={p.memberId}>{p.memberName} · {p.status}<div className="actions-row"><button className="btn" onClick={()=>void act(()=>reviewCommitteeMember({committeeId:x.id,memberId:p.memberId,decision:"approved"}))}>{c.approve}</button><button className="btn-ghost" onClick={()=>void act(()=>reviewCommitteeMember({committeeId:x.id,memberId:p.memberId,decision:"rejected"}))}>{c.reject}</button></div></div>)}</div><button className="btn" onClick={()=>void act(()=>lockCommittee(x.id),"Approved members randomly ordered; monthly schedule is ready.")}>{c.lock}</button></>:null}
        {isStaff&&x.status!=="enrolling"?<><h3>{c.cycle}</h3><div className="list">{x.cycle.map(row=><div className="card" key={row.cycleNumber}><strong>{row.cycleNumber}. {row.memberName}</strong> · ₹{row.amount.toLocaleString()}<p>{c.contributions}: {row.paid?"✓":"Pending"} · {c.payout}: {row.payoutPaid?"✓":"Pending"}</p>{x.status==="active"?<><div className="list">{row.contributions.map(contribution=><div className="actions-row" key={contribution.memberId}><span>Member #{contribution.memberId} · ₹{contribution.amount}: {contribution.received?"✓":"Pending"}</span><button className="btn-ghost" onClick={()=>void act(()=>markCommitteeContribution({committeeId:x.id,memberId:contribution.memberId,cycleNumber:row.cycleNumber,received:!contribution.received}))}>✓ {c.contributions}</button></div>)}</div><button className="btn-ghost" disabled={!row.paid} onClick={()=>void act(()=>markCommitteePayout({committeeId:x.id,cycleNumber:row.cycleNumber,paid:!row.payoutPaid}))}>₹ {c.payout}</button></>:null}</div>)}</div>{x.status==="active"?<button className="btn-ghost" onClick={()=>void act(()=>setCommitteeStatus(x.id,"paused"))}>{c.pause}</button>:null}</>:null}</article>):<div className="empty">{c.emptyCommittee}</div>}
    </>:null}
  </section>;
}

export function MemberGalleryReview({language}:{language:"en"|"ur"}){
 const c=copy[language];const [photos,setPhotos]=useState<MemberPhotoSubmission[]>([]);const [error,setError]=useState("");
 async function load(){try{setPhotos(await listPendingMemberPhotos());setError("");}catch(e){setError(errMessage(e));}}
 useEffect(()=>{void load();},[]);
 return <div className="list">{error?<p className="notice danger">{error}</p>:null}{photos.map(p=><article className="card" key={p.id}><img className="feature-photo" src={p.mediaUrl ?? ""} alt={p.caption??"Submitted member photo"}/><p>{membersLabel(p.memberId)} {p.caption?` · ${p.caption}`:""}</p><div className="actions-row"><button className="btn" onClick={()=>void reviewMemberPhoto(p.id,"approved").then(load)}>{c.approve}</button><button className="btn-ghost danger" onClick={()=>void reviewMemberPhoto(p.id,"rejected").then(load)}>{c.reject}</button></div></article>)}{!photos.length&&!error?<div className="empty">No pending member photos.</div>:null}</div>;
}
function membersLabel(id:number){return `Member #${id}`;}

function CompetitionCard({item,isStaff,canManage,members,activeQuiz,setActiveQuiz,answers,setAnswers,run,refresh,c}:{item:Competition;isStaff:boolean;canManage:boolean;members:Member[];activeQuiz:{competitionId:string;entryId:string;questions:PublicQuizQuestion[];durationSeconds:number}|null;setActiveQuiz:(v:{competitionId:string;entryId:string;questions:PublicQuizQuestion[];durationSeconds:number}|null)=>void;answers:Record<string,number>;setAnswers:(v:Record<string,number>)=>void;run:(fn:()=>Promise<unknown>,success?:string)=>Promise<void>;refresh:()=>Promise<void>;c:typeof copy.en}){
 const [entries,setEntries]=useState<{id:string;memberName:string;score:number|null}[]>([]);
 const [search,setSearch]=useState(""); const [selectedMember,setSelectedMember]=useState<Member|null>(null);
 const [guestMode,setGuestMode]=useState(false); const [guestName,setGuestName]=useState("");
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{if(item.status!=="open")return;const timer=window.setInterval(()=>setClock(Date.now()),15000);return()=>window.clearInterval(timer);},[item.status]);
 const matches=search.trim()?members.filter(m=>`${m.name} ${m.uniqueId??""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).slice(0,8):[];
 useEffect(()=>{if(isStaff) void listQuizEntries(item.id).then(setEntries).catch(()=>{});},[isStaff,item.id]);
 const startsAt=Date.parse(item.startsAt), endsAt=Date.parse(item.endsAt);
 const entryOpen=item.status==="open"&&clock>=startsAt&&clock<=endsAt;
 const memberCanStart=Boolean(selectedMember); const guestCanStart=Boolean(guestName.trim());
 return <article className="card feature-card">
   <div className="feature-card-heading"><div><h2>{item.title}</h2>{item.description?<p>{item.description}</p>:null}</div>{canManage?<button type="button" className="icon-btn quiz-delete-button" aria-label={c.deleteQuiz} title={c.deleteQuiz} onClick={()=>{if(window.confirm(c.deleteQuizConfirm))void run(()=>deleteCompetition(item.id),"Quiz deleted.");}}>×</button>:null}</div>
   <p><strong>{item.prize}</strong> · {item.status} · {item.entries??0} {isStaff?"entries":"participants"}</p>
   <p className="tree-sub">{c.start}: {new Date(item.startsAt).toLocaleString()} · {c.end}: {new Date(item.endsAt).toLocaleString()}</p>
   {!isStaff&&item.status==="open"&&!entryOpen?<p className="hint">{clock<startsAt?`${c.quizOpensAt}: ${new Date(item.startsAt).toLocaleString()}`:c.quizClosed}</p>:null}
   {!isStaff&&entryOpen? <div className="quiz-participant-picker">
     {!guestMode?<>
       <label>{c.searchMembers}<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setSelectedMember(null);}} placeholder={c.searchMembers}/></label>
       {search.trim()?<div className="quiz-member-results" role="listbox" aria-label={c.searchMembers}>{matches.length?matches.map(m=><button type="button" key={m.id} className={`btn-ghost${selectedMember?.id===m.id?" active":""}`} onClick={()=>{setSelectedMember(m);setSearch(`${m.name} · ${m.uniqueId||m.id}`);}}>{m.name} · {m.uniqueId||m.id}</button>):<p className="hint">{c.noMemberMatches}</p>}</div>:null}
       {selectedMember?<p className="hint">{c.selectedMember}: <strong>{selectedMember.name}</strong></p>:null}
       <button type="button" className="btn-ghost" onClick={()=>{setGuestMode(true);setSelectedMember(null);setSearch("");}}>{c.otherToggle}</button>
     </>:<>
       <label>{c.otherName}<input value={guestName} maxLength={120} onChange={e=>setGuestName(e.target.value)} placeholder={c.otherPlaceholder}/></label>
       <button type="button" className="btn-ghost" onClick={()=>{setGuestMode(false);setGuestName("");}}>{c.changeParticipant}</button>
     </>}
     <button className="btn" disabled={guestMode?!guestCanStart:!memberCanStart} onClick={()=>void run(async()=>{const entry=await enterQuiz({competitionId:item.id,memberId:guestMode?null:selectedMember?.id,participantName:guestMode?guestName.trim():undefined});const quiz=await startQuiz({competitionId:item.id,entryId:entry.id});setActiveQuiz({competitionId:item.id,...quiz});setAnswers({});})}>{c.play}</button>
   </div>:null}
   {activeQuiz?.competitionId===item.id?<div className="quiz-questions">{activeQuiz.questions.map((q,i)=><fieldset key={q.id}><legend>{i+1}. {q.prompt}</legend>{q.choices.map((choice,j)=><label key={j}><input type="radio" name={q.id} checked={answers[q.id]===j} onChange={()=>setAnswers({...answers,[q.id]:j})}/>{choice}</label>)}</fieldset>)}<button className="btn" onClick={()=>void run(async()=>{await submitQuiz({competitionId:item.id,entryId:activeQuiz.entryId,answers:Object.entries(answers).map(([questionId,choiceIndex])=>({questionId,choiceIndex}))});setActiveQuiz(null);},"Answers submitted.")}>{c.send}</button></div>:null}
   {canManage?<div className="actions-row"><button className="btn-ghost" disabled={item.status!=="open"||Date.now()<Date.parse(item.endsAt)} title={Date.now()<Date.parse(item.endsAt)?"Available after the quiz closes":""} onClick={()=>void run(async()=>{const winner=await chooseQuizWinner(item.id);alert(`${winner.memberName} · ${winner.score}`);await refresh();})}>{c.winner}</button>{entries.map(entry=><span className="tree-sub" key={entry.id}>{entry.memberName}: {entry.score??"—"}</span>)}</div>:null}
 </article>
}

export function MemberGallery({member,language,onSubmitted}:{member:Member;language:"en"|"ur";onSubmitted?:()=>void}){
 const c=copy[language]; const [photos,setPhotos]=useState<MemberPhotoSubmission[]>([]); const [open,setOpen]=useState(false);
 const [file,setFile]=useState<File|null>(null); const [caption,setCaption]=useState(""); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 const [selectedIndex,setSelectedIndex]=useState<number|null>(null); const [zoom,setZoom]=useState(1); const [pan,setPan]=useState({x:0,y:0});
 const panStart=useRef<{x:number;y:number;pointerX:number;pointerY:number}|null>(null); const swipeStart=useRef<number|null>(null);
 async function refresh(){try{setError("");setPhotos(await listMemberPhotos(member.id));}catch(e){setError(errMessage(e));}}
 useEffect(()=>{void refresh();},[member.id]);
 useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){if(selectedIndex!==null)setSelectedIndex(null);else setOpen(false);}if(selectedIndex!==null&&event.key==="ArrowLeft")movePhoto(-1);if(selectedIndex!==null&&event.key==="ArrowRight")movePhoto(1);};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[open,selectedIndex,photos.length]);
 function choosePhoto(index:number){setSelectedIndex(index);setZoom(1);setPan({x:0,y:0});}
 function movePhoto(direction:number){if(!photos.length)return;setSelectedIndex(index=>index===null?null:(index+direction+photos.length)%photos.length);setZoom(1);setPan({x:0,y:0});}
 function submitPhoto(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!file)return;setBusy(true);setError("");void uploadFamilyFeatureMedia(file,"member_photo",member.id).then(up=>submitMemberPhoto({memberId:member.id,caption,mediaPath:up.path})).then(async()=>{setMessage(c.pending);setFile(null);setCaption("");await refresh();onSubmitted?.();}).catch(e=>setError(errMessage(e))).finally(()=>setBusy(false));}
 return <>
   <button type="button" className="icon-btn member-gallery-trigger" aria-label={`${c.gallery} (${photos.length})`} title={c.gallery} onClick={()=>{setOpen(true);setMessage("");void refresh();}}>
     <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg><span>{photos.length}</span>
   </button>
   {open?<div className="modal-backdrop member-gallery-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
     <section className="modal-card member-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="member-gallery-title" dir={language==="ur"?"rtl":"ltr"}>
       <header className="modal-head"><div><h2 id="member-gallery-title">{c.gallery}</h2><p>{c.galleryIntro}</p></div><button type="button" className="icon-btn" aria-label={c.closeGallery} onClick={()=>setOpen(false)}>×</button></header>
       {error?<p className="notice danger">{error}</p>:null}
       {message?<p className="notice success">{message}</p>:null}
       <form className="feature-form member-gallery-upload" onSubmit={submitPhoto}>
         <label>{c.uploadPhoto}<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
         <label>{c.caption}<input value={caption} maxLength={300} onChange={e=>setCaption(e.target.value)}/></label>
         <button className="btn" disabled={busy||!file}>{busy?c.loading:c.submit}</button>
       </form>
       <div className="member-gallery-grid" aria-label={c.gallery}>
         {photos.map((photo,index)=><button type="button" className="member-gallery-thumb" key={photo.id} onClick={()=>choosePhoto(index)} aria-label={`${c.gallery}: ${photo.caption||member.name}`}>
           {photo.mediaUrl?<img src={photo.mediaUrl} alt="" loading="lazy"/>:null}{photo.caption?<span>{photo.caption}</span>:null}
         </button>)}
         {!photos.length?<div className="empty">{c.noMemberPhoto}</div>:null}
       </div>
     </section>
     {selectedIndex!==null&&photos[selectedIndex]?.mediaUrl?<div className="lightbox-backdrop member-gallery-lightbox" onClick={()=>setSelectedIndex(null)}>
       <div className="lightbox-toolbar" onClick={e=>e.stopPropagation()}>
         <button type="button" className="icon-btn" aria-label={c.zoomOut} onClick={()=>{setZoom(z=>Math.max(1,Number((z-0.25).toFixed(2))));setPan({x:0,y:0});}}>−</button>
         <button type="button" className="icon-btn" aria-label={c.zoomReset} onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>{Math.round(zoom*100)}%</button>
         <button type="button" className="icon-btn" aria-label={c.zoomIn} onClick={()=>setZoom(z=>Math.min(4,Number((z+0.25).toFixed(2))))}>+</button>
         <button type="button" className="close-btn icon-btn" aria-label={c.closeGallery} onClick={()=>setSelectedIndex(null)}>×</button>
       </div>
       {photos.length>1?<button type="button" className="lightbox-nav lightbox-nav-prev" aria-label={c.previousPhoto} onClick={e=>{e.stopPropagation();movePhoto(-1);}}>‹</button>:null}
       <div className="lightbox-viewport" onClick={e=>e.stopPropagation()} onWheel={e=>{e.preventDefault();setZoom(z=>Math.min(4,Math.max(1,Number((z-e.deltaY*0.001).toFixed(2)))));}} onTouchStart={e=>{swipeStart.current=e.touches[0]?.clientX??null;}} onTouchEnd={e=>{const start=swipeStart.current;swipeStart.current=null;if(start===null||zoom>1||photos.length<2)return;const delta=e.changedTouches[0].clientX-start;if(Math.abs(delta)>55)movePhoto(delta<0?1:-1);}} onPointerDown={e=>{if(zoom<=1)return;panStart.current={x:pan.x,y:pan.y,pointerX:e.clientX,pointerY:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const start=panStart.current;if(!start)return;setPan({x:start.x+e.clientX-start.pointerX,y:start.y+e.clientY-start.pointerY});}} onPointerUp={()=>{panStart.current=null;}}>
         <img src={photos[selectedIndex].mediaUrl!} alt={photos[selectedIndex].caption||member.name} style={{transform:`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}}/>
       </div>
       {photos.length>1?<button type="button" className="lightbox-nav lightbox-nav-next" aria-label={c.nextPhoto} onClick={e=>{e.stopPropagation();movePhoto(1);}}>›</button>:null}
       {photos[selectedIndex].caption?<div className="lightbox-caption">{photos[selectedIndex].caption}</div>:null}
     </div>:null}
   </div>:null}
 </>;
}
