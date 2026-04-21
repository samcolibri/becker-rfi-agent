// ═══════════════════════════════════════════════════════════════════════
// Becker RFI — Sandbox Setup (run in SF Developer Console: Execute Anonymous)
// Requires: System Admin profile (API user doesn't have Campaign create rights)
// Does: (1) creates 9 RFI campaigns, (2) adds 2 reps to each queue
//
// Current sandbox state (2026-04-21):
//   ✅ Andrea Jennings already in Global Firms
//   ✅ Amy Johnson already in University
//   ⚠  All other reps are portal/community users (CspLitePortal) — cannot be queue members
//      Huma must activate their Standard licenses or use alternate reps
// ═══════════════════════════════════════════════════════════════════════

// ── 1. Campaigns ──────────────────────────────────────────────────────
List<Campaign> campaigns = new List<Campaign>{
    new Campaign(Name='Becker RFI - CPA',                  Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - CMA',                  Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - CPE',                  Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - CIA',                  Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - EA',                   Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - CFP',                  Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - Staff Level Training', Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - CIA Challenge Exam',   Type='Other', Status='Active', IsActive=true),
    new Campaign(Name='Becker RFI - B2B',                  Type='Other', Status='Active', IsActive=true)
};
insert campaigns;

Map<String, Id> campaignIdMap = new Map<String, Id>();
for (Campaign c : [SELECT Id, Name FROM Campaign WHERE Name LIKE 'Becker RFI%' ORDER BY Name]) {
    campaignIdMap.put(c.Name, c.Id);
    System.debug('CAMPAIGN: ' + c.Name + ' = ' + c.Id);
}

// ── 2. Queue members ──────────────────────────────────────────────────
// NOTE: Only Standard-type users can be queue members.
// In this sandbox, most reps are CspLitePortal users — they cannot be queue members.
// These Standard active users were confirmed via API (2026-04-21):
//   Andrea Jennings (0050Z000008sRhmQAE) — Standard, active — already in Global Firms
//   Amy Johnson (005i0000002xKHhAAM) — Standard, active — already in University
// To add others: activate their Standard user accounts in sandbox Setup → Users

Map<String, List<String>> queueReps = new Map<String, List<String>>{
    'Global Firms'                 => new List<String>{'Andrea Jennings', 'Kristin Curcuru'},
    'New Client Acquisition'       => new List<String>{'Angelique Watson', 'Henry Quinones'},
    'University'                   => new List<String>{'Amy Johnson', 'Aaron Gocer'},
    'International'                => new List<String>{'Ben Wong', 'Digvijay Singh'},
    'Customer Success & Expansion' => new List<String>{'Alexandria Reyes', 'Ashley Stephens'}
};

// Get all queue IDs
Map<String, Id> queueIdMap = new Map<String, Id>();
for (Group g : [SELECT Id, Name FROM Group WHERE Type = 'Queue' AND Name IN :queueReps.keySet()]) {
    queueIdMap.put(g.Name, g.Id);
    System.debug('QUEUE: ' + g.Name + ' = ' + g.Id);
}

// Get Standard active user IDs only (portal users cannot be queue members)
Set<String> allRepNames = new Set<String>();
for (List<String> reps : queueReps.values()) allRepNames.addAll(reps);
Map<String, Id> userIdMap = new Map<String, Id>();
for (User u : [SELECT Id, Name FROM User WHERE Name IN :allRepNames AND IsActive = true AND UserType = 'Standard']) {
    userIdMap.put(u.Name, u.Id);
    System.debug('USER (Standard): ' + u.Name + ' = ' + u.Id);
}

// Add members
List<GroupMember> members = new List<GroupMember>();
for (String qName : queueReps.keySet()) {
    Id qId = queueIdMap.get(qName);
    if (qId == null) { System.debug('QUEUE NOT FOUND: ' + qName); continue; }
    for (String repName : queueReps.get(qName)) {
        Id uId = userIdMap.get(repName);
        if (uId == null) { System.debug('USER NOT FOUND (or portal-only): ' + repName); continue; }
        members.add(new GroupMember(GroupId = qId, UserOrGroupId = uId));
    }
}

try {
    insert members;
    System.debug('Added ' + members.size() + ' queue members successfully.');
} catch (DmlException e) {
    System.debug('Error adding members: ' + e.getMessage());
    // Try inserting one by one to skip duplicates
    for (GroupMember m : members) {
        try { insert m; } catch (DmlException ex) { System.debug('Skip: ' + ex.getMessage()); }
    }
}

System.debug('=== DONE ===');
System.debug('Copy campaign IDs from debug log above and update lead-processor.js B2C_CAMPAIGN_IDS and B2B_CAMPAIGN_ID');
