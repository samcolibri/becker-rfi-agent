// Run this in SF Developer Console → Execute Anonymous
// Creates 9 RFI campaigns in the sandbox.
// After running, copy the IDs from the debug log.

List<Campaign> campaigns = new List<Campaign>{
    new Campaign(Name='Becker RFI - CPA',                  Type='Other', Status='Active', Description='RFI form - CPA product interest (B2C)'),
    new Campaign(Name='Becker RFI - CMA',                  Type='Other', Status='Active', Description='RFI form - CMA product interest (B2C)'),
    new Campaign(Name='Becker RFI - CPE',                  Type='Other', Status='Active', Description='RFI form - CPE product interest (B2C)'),
    new Campaign(Name='Becker RFI - CIA',                  Type='Other', Status='Active', Description='RFI form - CIA product interest (B2C)'),
    new Campaign(Name='Becker RFI - EA',                   Type='Other', Status='Active', Description='RFI form - EA product interest (B2C)'),
    new Campaign(Name='Becker RFI - CFP',                  Type='Other', Status='Active', Description='RFI form - CFP product interest (B2C)'),
    new Campaign(Name='Becker RFI - Staff Level Training', Type='Other', Status='Active', Description='RFI form - Staff Level Training (B2C)'),
    new Campaign(Name='Becker RFI - CIA Challenge Exam',   Type='Other', Status='Active', Description='RFI form - CIA Challenge Exam (B2C)'),
    new Campaign(Name='Becker RFI - B2B',                  Type='Other', Status='Active', Description='RFI form - All B2B submissions')
};

insert campaigns;

System.debug('=== CAMPAIGN IDs FOR lead-processor.js ===');
for (Campaign c : [SELECT Id, Name FROM Campaign WHERE Name LIKE 'Becker RFI%' ORDER BY Name]) {
    System.debug(c.Name + ' → ' + c.Id);
}
System.debug('=== END ===');
