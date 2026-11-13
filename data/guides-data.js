// Native guide pages and the Instructions & Downloads manifest.
// Guides with `checklist` items save progress in the encrypted vault (keyed by item id).

export const GUIDES = [
  {
    id: "start-here", title: "Start Here: First Steps",
    summary: "A calm, practical order of operations for the first week.",
    sections: [
      { heading: "What this app is for",
        paragraphs: ["Case Compass helps you keep accurate, private records, organize evidence, track appointments and deadlines, and find verified Colorado and Pueblo County resources. It is an organizational and educational tool, not legal advice, and it cannot predict or guarantee any court outcome."] },
      { heading: "Your first week",
        checklist: [
          { id: "SH1", text: "Create your vault with a strong passphrase and write the passphrase down somewhere safe. If it is lost, your data cannot be recovered." },
          { id: "SH2", text: "Make your first encrypted backup (Reports › Backup) and store it somewhere other than this device." },
          { id: "SH3", text: "Add each child under Parenting › Children." },
          { id: "SH4", text: "Enter any court dates or deadlines from official papers under Home › Calendar & Tasks, including where each date came from." },
          { id: "SH5", text: "Record the most recent important events, starting with the newest, using factual language." },
          { id: "SH6", text: "Add existing screenshots, documents, and photos to the Evidence Library. Keep the originals unchanged." },
          { id: "SH7", text: "Open Protection & Security and choose the one protocol that matters most right now." },
          { id: "SH8", text: "Write down questions for an attorney in the Attorney Workspace." },
        ] },
      { heading: "If you are in danger",
        paragraphs: ["Call 911. For confidential domestic violence support in Pueblo, call Mariposa Center for Safety's 24-hour hotline at 719-545-8195. For an emotional or mental health crisis, call or text 988."] },
    ],
  },
  {
    id: "why-protections", title: "Why These Protections Matter",
    summary: "The reasons behind the safety and privacy steps, in plain English.",
    sections: [
      { heading: "Accurate records protect everyone",
        paragraphs: ["Memories fade and stressful events blur together. Records written close to the time, with dates and specific details, are more reliable and more useful to an attorney than recollections months later. Writing what you saw, rather than what you think it meant, keeps your records credible."] },
      { heading: "Privacy keeps your plans and records your own",
        paragraphs: ["If another person can read your messages, see your location, or access your accounts, they may learn about your plans or your records. Securing accounts from a trusted device closes those doors.", "Case Compass encrypts your records on this device. Nothing is uploaded. That also means you are responsible for keeping backups."] },
      { heading: "Preserve before you change",
        paragraphs: ["Removing an unknown device, deleting a forwarding rule, or resetting a phone can destroy the evidence that something was wrong. Screenshot or photograph first, write down the date, then make the change if it is safe."] },
      { heading: "Changes can be noticed",
        paragraphs: ["Many services notify people when sharing stops, devices are removed, or passwords change. If your safety could be affected, plan timing with an advocate before you act."] },
      { heading: "Calm communication helps your children",
        paragraphs: ["Courts focus on children's best interests, including each parent's ability to support the child's relationship with the other parent. Brief, respectful, child-focused communication is better for children and is reflected well in any record."] },
    ],
  },
  {
    id: "documenting", title: "How to Document Events Factually",
    summary: "Guidance for writing records that are accurate, neutral, and useful.",
    sections: [
      { heading: "Write soon, write specifically",
        bullets: ["Record events as soon as it is safe to do so. The app records both the event date and the date you entered it.", "Use exact dates, times, and places.", "Quote exact words only when you remember them; otherwise write a summary and say it is a summary.", "Name who was present and who else might have seen or heard."] },
      { heading: "Separate what you observed from what you were told",
        paragraphs: ["Mark whether you personally saw or heard something, or whether someone told you about it. Both can be recorded, but they are different kinds of information."] },
      { heading: "Avoid conclusions and labels",
        bullets: ["Write 'The other parent texted that the children would not come on Saturday' rather than 'The other parent is alienating the children.'", "Do not diagnose anyone or describe personalities.", "Do not assume an allegation is true because it was made, including allegations about you."] },
      { heading: "Never alter or create evidence",
        bullets: ["Keep originals unchanged. Save cropped or annotated copies separately and label them.", "Do not backdate records. If you are writing about an older event, that is fine; the app shows when it was entered.", "Do not record conversations you are not part of, or access another person's accounts or devices."] },
      { heading: "Helpful prompts",
        bullets: ["What happened?", "What did you personally observe?", "Who was present?", "What evidence is available, and where is the original?", "What happened afterward?"] },
    ],
  },
  {
    id: "child-statements", title: "Children's Statements: Do's and Don'ts",
    summary: "How to record what a child says without pressuring them.",
    sections: [
      { heading: "Record spontaneous statements only",
        paragraphs: ["If a child says something important on their own, write down their exact words as soon as you can, along with the context, who heard it, and when. Use Parenting › Children › Record a Child Statement."] },
      { heading: "Please do not",
        bullets: ["Ask leading or repeated questions about the other parent or the case.", "Ask a child to keep secrets, carry messages, take photos, record, or gather evidence.", "Discuss court matters, allegations, or adult conflict with or near the children.", "Reward or react strongly to what a child says about the other parent."] },
      { heading: "If you are worried about a child's safety",
        paragraphs: ["Call 911 in an emergency. Concerns about abuse or neglect can be reported to the Colorado Child Abuse and Neglect Hotline at 1-844-264-5437 (1-844-CO-4-KIDS). Professionals such as forensic interviewers are trained to talk with children without influencing them."] },
    ],
  },
  {
    id: "parenting-time-checklist", title: "Parenting-Time Preparation Checklist",
    summary: "Steps that support a request for an appropriate parenting arrangement, including equal parenting time as a goal.",
    sections: [
      { heading: "Understand the standard",
        paragraphs: ["Colorado courts decide parenting time based on the children's best interests (C.R.S. § 14-10-124). Equal parenting time is a goal you can propose and support with evidence of involvement and stability; it is not guaranteed."] },
      { heading: "Show consistent involvement",
        checklist: [
          { id: "PT1", text: "Log every parenting-time request, whether it was granted, and what happened." },
          { id: "PT2", text: "Log completed parenting time, overnights, and exchanges accurately (including late or missed ones on either side)." },
          { id: "PT3", text: "Record school involvement: conferences, events, communication with teachers." },
          { id: "PT4", text: "Record medical, dental, and counseling involvement." },
          { id: "PT5", text: "Record extracurricular activities you attend or support." },
          { id: "PT6", text: "Keep communication with the other parent brief, respectful, and in writing when possible." },
        ] },
      { heading: "Prepare a workable plan",
        checklist: [
          { id: "PT7", text: "Describe your home, sleeping arrangements, and school transportation." },
          { id: "PT8", text: "Draft a proposed schedule (weekly, holidays, summer) with exchange times and locations." },
          { id: "PT9", text: "Plan childcare coverage for your work schedule." },
          { id: "PT10", text: "Complete the required parenting class from a Pueblo-listed provider and save the certificate." },
          { id: "PT11", text: "Review JDF 1113 Parenting Plan and prepare your draft." },
        ] },
      { heading: "Before a consultation or filing",
        checklist: [
          { id: "PT12", text: "Generate a Parenting-Time report comparing requested, scheduled, and completed time." },
          { id: "PT13", text: "Generate an Attorney Preparation Packet with only the information needed." },
          { id: "PT14", text: "Confirm whether you need a new case, a modification, or enforcement (see Court Forms)." },
        ] },
    ],
  },
  {
    id: "evidence-handling", title: "Handling Evidence Safely",
    summary: "Keeping originals intact and traceable.",
    sections: [
      { heading: "Originals stay original",
        bullets: ["Case Compass stores the exact file you add and records its SHA-256 fingerprint (hash). If the file ever changed, the hash would no longer match.", "Annotated, cropped, or compressed versions should be added as separate evidence items and linked to the original.", "If the original lives somewhere else (a phone, a cloud account, a USB drive), add a reference record that describes where it is."] },
      { heading: "Record the source",
        bullets: ["Where did it come from (device, account, person)?", "When was it created and when did you receive it?", "Has it been transferred or copied? Note each step."] },
      { heading: "Back up",
        paragraphs: ["Encrypted Case Compass backups include attachments. Store at least one backup away from this device. Mark evidence items as backed up once a backup containing them has been verified."] },
      { heading: "About reports",
        paragraphs: ["Reports generated by Case Compass are organized summaries of your own records. They are not court filings and are not automatically admissible as evidence. Your attorney can advise how evidence should be presented."] },
    ],
  },
  {
    id: "monthly-review", title: "Monthly Review Routine",
    summary: "Fifteen minutes a month keeps records complete and backups current.",
    sections: [
      { heading: "Each month",
        checklist: [
          { id: "MR1", text: "Review the Timeline for the past month and fill any gaps." },
          { id: "MR2", text: "Resolve or update open follow-ups." },
          { id: "MR3", text: "Check upcoming deadlines and appointments." },
          { id: "MR4", text: "Generate a Monthly Report (PDF or Word) for your files." },
          { id: "MR5", text: "Make and verify an encrypted backup." },
          { id: "MR6", text: "Re-check one Protection & Security protocol." },
        ] },
    ],
  },
  {
    id: "device-privacy", title: "Using Case Compass on a Possibly Monitored Device",
    summary: "What the app can and cannot protect.",
    sections: [
      { heading: "What Case Compass protects",
        bullets: ["Records and attachments are encrypted on this device with your passphrase.", "The vault locks automatically after inactivity and can be locked manually.", "No analytics, trackers, or uploads. Your records never leave this device unless you export them."] },
      { heading: "What it cannot protect",
        bullets: ["Monitoring software on the device can capture what you type or see while the vault is unlocked.", "Downloaded reports and backups are files on the device; unencrypted exports can be read by anyone with access.", "Your browser history may show that you visited this site.", "Quick Exit switches to a neutral page and locks the vault, but it cannot erase browser history, downloaded files, or monitoring software."] },
      { heading: "Safer habits",
        bullets: ["Use a device you trust when possible.", "Lock the vault when you step away.", "Delete unencrypted exports after you have shared them securely.", "Prefer encrypted backups for storage."] },
    ],
  },
];

// Instructions & Downloads manifest. `path` is relative to the app root; `route` opens a native page.
export const LIBRARY_VERSION = "3.0.0";
export const LIBRARY = [
  { id: "lib-start", title: "Start Here: First Steps", type: "Native guide", route: "#/resources/guides/start-here", version: "3.0", offline: true, replaces: ["Begin Here packet", "Start-here checklist", "First-steps protection guide"] },
  { id: "lib-why", title: "Why These Protections Matter", type: "Native guide", route: "#/resources/guides/why-protections", version: "3.0", offline: true, replaces: ["Why these protections matter"] },
  { id: "lib-protocols", title: "Protection & Security protocols A–G (interactive checklists)", type: "Native checklist", route: "#/resources/protection", version: "3.0", offline: true, replaces: ["Mobile security checklist", "Digital safety guide", "Home and digital safety guide", "Home security, legal and digital checklist", "Digital safety scenario protocol manual", "Modular protocols v2"] },
  { id: "lib-documenting", title: "How to Document Events Factually", type: "Native guide", route: "#/resources/guides/documenting", version: "3.0", offline: true, replaces: ["Planner user guide"] },
  { id: "lib-pt-checklist", title: "Parenting-Time Preparation Checklist", type: "Native checklist", route: "#/resources/guides/parenting-time-checklist", version: "3.0", offline: true, replaces: ["50/50 parenting family court checklist"] },
  { id: "lib-forms", title: "Court Forms Directory", type: "Native directory", route: "#/resources/forms", version: "2026-11-13", offline: true, replaces: ["Family court complete packet 2026", "Family law master packet"] },
  { id: "lib-atlas", title: "Resource Atlas", type: "Native directory", route: "#/resources/directory", version: "2026-11-13", offline: true, replaces: ["Court Resource Atlas", "Court Resource Organizer", "Worksheet resources organizer"] },
  { id: "lib-evidence", title: "Handling Evidence Safely", type: "Native guide", route: "#/resources/guides/evidence-handling", version: "3.0", offline: true },
  { id: "lib-children", title: "Children's Statements: Do's and Don'ts", type: "Native guide", route: "#/resources/guides/child-statements", version: "3.0", offline: true },
  { id: "lib-monthly", title: "Monthly Review Routine", type: "Native checklist", route: "#/resources/guides/monthly-review", version: "3.0", offline: true },
  { id: "lib-device", title: "Using Case Compass on a Possibly Monitored Device", type: "Native guide", route: "#/resources/guides/device-privacy", version: "3.0", offline: true },
  { id: "lib-manual", title: "User Manual (printable PDF)", type: "PDF", path: "docs/Case_Compass_User_Manual.pdf", version: "3.0", offline: true },
  { id: "lib-quickstart", title: "Quick Start (printable PDF, 2 pages)", type: "PDF", path: "docs/Case_Compass_Quick_Start.pdf", version: "3.0", offline: true },
  { id: "lib-install", title: "Installation guide (iPhone and computer)", type: "Web page", path: "docs/INSTALL.html", version: "3.0", offline: true },
  { id: "lib-sample-pdf", title: "SAMPLE monthly report – fictional data (PDF)", type: "PDF", path: "samples/SAMPLE_Monthly_Report_October_2026.pdf", version: "3.0", offline: true, replaces: ["Monthly example report (DOCX)", "Monthly example workbook (XLSX)"] },
  { id: "lib-sample-docx", title: "SAMPLE monthly report – fictional data (Word)", type: "Word", path: "samples/SAMPLE_Monthly_Report_October_2026.docx", version: "3.0", offline: true },
  { id: "lib-sample-xlsx", title: "SAMPLE case workbook – fictional data (Excel)", type: "Excel", path: "samples/SAMPLE_Case_Workbook_October_2026.xlsx", version: "3.0", offline: true },
  { id: "lib-blank-forms", title: "Blank printable logs (incident, communication, parenting time)", type: "Generated PDF", route: "#/reports?kind=blank", version: "3.0", offline: true },
];

// Original project materials named in the build specification, described generically. None were
// present in the repository when version 3.0 was built, so they could not be reviewed or bundled.
export const SOURCE_GAPS = [
  "Earlier documentation app (HTML)", "Family-law planner – mobile edition (HTML)", "Family-law planner – simplified edition (HTML)",
  "Planner (HTML, earlier version)", "Court Resource Atlas (HTML, about 77 entries in nine categories)", "Court Resource Organizer (XLSX)",
  "Begin Here packet (PDF)", "Long initial preparedness packet (PDF)", "Why these protections matter (HTML)", "Start-here checklist (HTML)",
  "First-steps protection guide (HTML)", "Mobile security checklist (HTML)", "Pueblo home security, legal and digital checklist (PDF)",
  "Digital safety guide (PDF)", "Home and digital safety guide (PDF)", "Pueblo family court complete packet 2026 (PDF)",
  "Pueblo family law master packet (PDF)", "Pueblo 50/50 parenting family court checklist (PDF)", "Worksheet resources organizer (XLSX)",
  "Planner user guide (PDF)", "Monthly example report, October 2026 (DOCX)", "Monthly example workbook, October 2026 (XLSX)",
  "Digital safety scenario protocol manual v1 (DOCX)", "Modular digital, physical, legal and service protocols v2 (DOCX)",
];
