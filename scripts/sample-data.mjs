// FICTIONAL sample data for the sample export package and automated tests.
// Every person, place detail, and event here is invented. This module is never loaded by the app.

let n = 0;
const id = (p) => `sample-${p}-${String(++n).padStart(3, "0")}`;
const at = (d, t = "20:15") => new Date(`${d}T${t}:00-06:00`).toISOString();

export function sampleRecords() {
  n = 0;
  const avery = { id: id("ch"), ref: "CH-0001", type: "child", createdAt: at("2026-09-28"), updatedAt: at("2026-09-28"), version: 1, deleted: false,
    data: { name: "Avery Example (fictional)", dob: "2018-04-12", school: "Sample Elementary (fictional)", grade: "3", schedule: "School 8:00 a.m.–3:05 p.m. Mon–Fri.", activities: "Soccer, Saturdays 9:00 a.m.", providers: "Dr. Placeholder (pediatrics)" } };
  const riley = { id: id("ch"), ref: "CH-0002", type: "child", createdAt: at("2026-09-28"), updatedAt: at("2026-09-28"), version: 1, deleted: false,
    data: { name: "Riley Example (fictional)", dob: "2021-09-03", school: "Sample Preschool (fictional)", grade: "Pre-K", schedule: "Preschool 8:30 a.m.–12:00 p.m. Mon/Wed/Fri." } };
  const ev1 = { id: id("ev"), ref: "EV-0001", type: "evidence", createdAt: at("2026-10-04", "21:02"), updatedAt: at("2026-10-04", "21:02"), version: 1, deleted: false,
    data: { title: "Screenshot of text request for weekend parenting time (fictional)", evidenceType: "Screenshot", source: "My phone, Messages app", sourceDevice: "Personal phone", dateCreated: "2026-10-03",
      storageLocation: "In Case Compass (encrypted); original remains on phone", backupStatus: "Included in a verified encrypted backup", handling: "Exported from phone to app on Oct 4, 2026.", notes: "Shows message sent 6:42 p.m.; no reply visible.",
      file: { blobId: "sample-blob-1", name: "IMG_0412.PNG", type: "image/png", size: 248113, sha256: "3f8a1c9e5b7d2a4f6e8c0b1d3a5f7e9c2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a", addedAt: at("2026-10-04", "21:02") } } };
  const ev2 = { id: id("ev"), ref: "EV-0002", type: "evidence", createdAt: at("2026-10-18", "19:30"), updatedAt: at("2026-10-18", "19:30"), version: 1, deleted: false,
    data: { title: "Photo of exchange location sign-in sheet (fictional)", evidenceType: "Photo", source: "Taken by me", dateCreated: "2026-10-17", storageLocation: "In Case Compass (encrypted)", backupStatus: "Not backed up",
      file: { blobId: "sample-blob-2", name: "IMG_0533.JPG", type: "image/jpeg", size: 1840221, sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90", addedAt: at("2026-10-18", "19:30") } } };
  const com1 = { id: id("com"), ref: "COM-0001", type: "communication", createdAt: at("2026-10-03", "19:05"), updatedAt: at("2026-10-05", "08:10"), version: 2, deleted: false,
    data: { date: "2026-10-03", time: "18:42", tz: "America/Denver", method: "Text message", initiator: "I did", participants: ["Other Parent (fictional)"], subject: "Request for weekend parenting time Oct 10–11",
      contentType: "Exact words", content: "“Could I have the kids Saturday the 10th from 10 to 6? I can pick up and drop off.”", request: "Request for parenting time", requestDetails: "Sat Oct 10, 10:00 a.m.–6:00 p.m.",
      responseStatus: "No response (unanswered)", response: "No reply as of Oct 5.", status: "Open", followUp: "Send a brief follow-up message on Oct 6.", attachments: [ev1.id] } };
  const pt1 = { id: id("pt"), ref: "PT-0001", type: "parenting", createdAt: at("2026-10-05", "08:12"), updatedAt: at("2026-10-05", "08:12"), version: 1, deleted: false,
    data: { entryType: "Requested parenting time", children: [avery.id, riley.id], date: "2026-10-10", startTime: "10:00", endTime: "18:00", tz: "America/Denver", requestedOn: "2026-10-03", outcome: "No response", reason: "No response received.", related: [com1.id] } };
  const pt2 = { id: id("pt"), ref: "PT-0002", type: "parenting", createdAt: at("2026-10-12", "20:00"), updatedAt: at("2026-10-12", "20:00"), version: 1, deleted: false,
    data: { entryType: "Completed parenting time", children: [avery.id, riley.id], date: "2026-10-11", startTime: "09:00", endDate: "2026-10-12", endTime: "17:00", tz: "America/Denver", overnights: 1, outcome: "Completed as planned", location: "Exchange at Sample Library (fictional)", activities: "Soccer game, homework, park visit." } };
  const pt3 = { id: id("pt"), ref: "PT-0003", type: "parenting", createdAt: at("2026-10-17", "21:00"), updatedAt: at("2026-10-17", "21:00"), version: 1, deleted: false,
    data: { entryType: "Scheduled parenting time", children: [avery.id, riley.id], date: "2026-10-17", startTime: "10:00", endTime: "18:00", tz: "America/Denver", outcome: "Cancelled by other parent", reason: "“They have a birthday party.” (text, Oct 16)", location: "Sample Library (fictional)" } };
  const pt4 = { id: id("pt"), ref: "PT-0004", type: "parenting", createdAt: at("2026-10-22", "18:00"), updatedAt: at("2026-10-22", "18:00"), version: 1, deleted: false,
    data: { entryType: "School involvement", children: [avery.id], date: "2026-10-22", startTime: "16:00", endTime: "16:30", outcome: "Not applicable", activities: "Attended parent-teacher conference (fictional)." } };
  const pt5 = { id: id("pt"), ref: "PT-0005", type: "parenting", createdAt: at("2026-10-26", "21:00"), updatedAt: at("2026-10-26", "21:00"), version: 1, deleted: false,
    data: { entryType: "Completed parenting time", children: [avery.id, riley.id], date: "2026-10-24", startTime: "10:00", endDate: "2026-10-25", endTime: "18:00", overnights: 1, outcome: "Completed as planned", activities: "Pumpkin patch, library story time." } };
  const inc1 = { id: id("inc"), ref: "INC-0001", type: "incident", createdAt: at("2026-10-19", "22:10"), updatedAt: at("2026-10-19", "22:10"), version: 1, deleted: false,
    data: { title: "Scheduled exchange did not take place (fictional)", date: "2026-10-17", time: "10:00", tz: "America/Denver", location: "Sample Library parking lot (fictional)", category: "Parenting time or exchange",
      people: ["Other Parent (fictional)"], witnesses: ["Library staff member (name not known)"], description: "I arrived at 9:52 a.m. for the scheduled 10:00 a.m. exchange. I waited until 10:45 a.m. No one arrived. I sent one text at 10:15 a.m.",
      observation: "I personally saw or heard this", observed: "No vehicle arrived; I signed the library visitor log at 9:55 a.m.", evidenceNotes: "Photo of sign-in sheet (EV-0002). Text message on my phone.", attachments: [ev2.id],
      police: "None", afterward: "Recorded the missed exchange and sent a brief text asking to reschedule.", followUp: "Ask attorney about documenting cancellations.", status: "Open", related: [pt3.id], privateNotes: "PRIVATE NOTE (fictional): felt frustrated." } };
  const pol1 = { id: id("pol"), ref: "POL-0001", type: "police", createdAt: at("2026-10-20", "12:00"), updatedAt: at("2026-10-20", "12:00"), version: 1, deleted: false,
    data: { agency: "Sample Police Department (fictional)", contactType: "Records request", date: "2026-10-20", time: "11:30", officer: "Records clerk (name not given)", caseNumber: "", reportNumber: "", summary: "Asked how to request records. Told to use the online request form.", recordsStatus: "Requested", recordsRequested: "2026-10-20", status: "Open" } };
  const cs1 = { id: id("cs"), ref: "CS-0001", type: "childStatement", createdAt: at("2026-10-25", "20:30"), updatedAt: at("2026-10-25", "20:30"), version: 1, deleted: false,
    data: { children: [avery.id], date: "2026-10-25", time: "17:40", statement: "“I liked the pumpkin patch. Can we go again next year?”", spontaneous: "The child raised it on their own", context: "In the car after the pumpkin patch.", heardBy: ["Me"], response: "Said we could plan for it." } };
  const t1 = { id: id("tsk"), ref: "TSK-0001", type: "task", createdAt: at("2026-10-01"), updatedAt: at("2026-10-01"), version: 1, deleted: false,
    data: { title: "Attorney consultation (fictional)", kind: "Attorney consultation", dueDate: "2026-11-05", dueTime: "14:00", location: "Sample Law Office (fictional)", priority: "High", status: "Not started", description: "Bring the attorney packet." } };
  const t2 = { id: id("tsk"), ref: "TSK-0002", type: "task", createdAt: at("2026-10-02"), updatedAt: at("2026-10-02"), version: 1, deleted: false,
    data: { title: "Complete Level 1 parenting class", kind: "Parenting class", dueDate: "2026-10-30", priority: "Medium", status: "Done", completedDate: "2026-10-28", description: "Certificate saved." } };
  const t3 = { id: id("tsk"), ref: "TSK-0003", type: "task", createdAt: at("2026-10-02"), updatedAt: at("2026-10-02"), version: 1, deleted: false,
    data: { title: "Sample hearing date (fictional)", kind: "Court hearing", dueDate: "2026-12-03", dueTime: "09:00", location: "Sample courtroom (fictional)", priority: "High", status: "Not started", deadlineSource: "Fictional notice of hearing dated Oct 2, 2026" } };
  const a1 = { id: id("att"), ref: "ATT-0001", type: "attorney", createdAt: at("2026-10-01"), updatedAt: at("2026-10-01"), version: 1, deleted: false,
    data: { name: "Pat Placeholder (fictional)", firm: "Sample Family Law (fictional)", consultDate: "2026-11-05", fees: "Consultation $150 (fictional)", questions: "Should I file a new case or wait?\nHow should I document cancelled exchanges?\nWhat parenting schedule options fit the children's school routine?", documentsRequested: "Parenting-time log, communications, school calendar", representation: "Consultation scheduled", advice: "PRIVATE (fictional prior advice)" } };
  const x1 = { id: id("exp"), ref: "EXP-0001", type: "expense", createdAt: at("2026-10-28"), updatedAt: at("2026-10-28"), version: 1, deleted: false,
    data: { date: "2026-10-28", amount: 45, category: "Parenting class", description: "Level 1 parenting class fee (fictional)", paidTo: "Sample class provider", paidBy: "Me" } };
  return [avery, riley, ev1, ev2, com1, pt1, pt2, pt3, pt4, pt5, inc1, pol1, cs1, t1, t2, t3, a1, x1];
}

export function sampleCtx(records, extra = {}) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return {
    getRecord: (rid) => byId.get(rid) || null,
    childName: (cid, initials) => {
      const c = byId.get(cid); const name = c?.data?.name || "Child";
      return initials ? name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0] + ".").join("") : name;
    },
    settings: { preparedBy: "Sample Parent (fictional)", caseCaption: "SAMPLE – fictional matter for demonstration only" },
    now: new Date("2026-11-01T17:00:00-06:00"),
    checklists: { A1: { done: true, date: "2026-10-02" }, B1: { done: true, date: "2026-10-03" }, B2: { done: true, date: "2026-10-03" }, F1: { done: true, date: "2026-10-09" }, SH1: { done: true, date: "2026-10-01" } },
    ...extra,
  };
}
