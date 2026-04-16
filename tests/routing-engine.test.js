const { routeLead, routeB2B, normalizeSize, QUEUES } = require('../src/routing-engine');

// -- normalizeSize --
test('normalizeSize: maps 1-10 to <25', () => expect(normalizeSize('1-10')).toBe('<25'));
test('normalizeSize: maps 26-50 to 26-100', () => expect(normalizeSize('26-50')).toBe('26-100'));
test('normalizeSize: maps 51-100 to 26-100', () => expect(normalizeSize('51-100')).toBe('26-100'));
test('normalizeSize: maps 251-500 to 251+', () => expect(normalizeSize('251-500')).toBe('251+'));
test('normalizeSize: maps 500+ to 251+', () => expect(normalizeSize('500+')).toBe('251+'));
test('normalizeSize: handles null', () => expect(normalizeSize(null)).toBe('<25'));

// -- B2B routing matrix --
describe('Accounting Firm routing', () => {
  test('<25 → Inside Sales', () => {
    expect(routeB2B({ orgType: 'Accounting Firm', employeeCount: '<25' }).queue).toBe(QUEUES.INSIDE_SALES);
  });
  test('26-100 → Global Firms', () => {
    expect(routeB2B({ orgType: 'Accounting Firm', employeeCount: '26-100' }).queue).toBe(QUEUES.GLOBAL_FIRMS);
  });
  test('101-250 → Global Firms', () => {
    expect(routeB2B({ orgType: 'Accounting Firm', employeeCount: '101-250' }).queue).toBe(QUEUES.GLOBAL_FIRMS);
  });
  test('251+ → Global Firms', () => {
    expect(routeB2B({ orgType: 'Accounting Firm', employeeCount: '251+' }).queue).toBe(QUEUES.GLOBAL_FIRMS);
  });
});

describe('Corporation routing', () => {
  test('<25 → Inside Sales', () => {
    const r = routeB2B({ orgType: 'Corporation/Healthcare/Bank/Financial Institution', employeeCount: '<25' });
    expect(r.queue).toBe(QUEUES.INSIDE_SALES);
  });
  test('26-100 → NCA', () => {
    const r = routeB2B({ orgType: 'Corporation/Healthcare/Bank/Financial Institution', employeeCount: '26-100' });
    expect(r.queue).toBe(QUEUES.NCA);
  });
  test('251+ → NCA', () => {
    const r = routeB2B({ orgType: 'Corporation/Healthcare/Bank/Financial Institution', employeeCount: '251+' });
    expect(r.queue).toBe(QUEUES.NCA);
  });
});

describe('Consulting Firm routing', () => {
  test('all sizes → Global Firms', () => {
    ['<25','26-100','101-250','251+'].forEach(size => {
      expect(routeB2B({ orgType: 'Consulting Firm', employeeCount: size }).queue).toBe(QUEUES.GLOBAL_FIRMS);
    });
  });
});

describe('Society/Chapter routing', () => {
  test('all sizes → University', () => {
    ['<25','26-100','101-250','251+'].forEach(size => {
      expect(routeB2B({ orgType: 'Society/Chapter', employeeCount: size }).queue).toBe(QUEUES.UNIVERSITY);
    });
  });
});

describe('Non-US Organization routing', () => {
  test('all sizes → International', () => {
    ['<25','26-100','101-250','251+'].forEach(size => {
      expect(routeB2B({ orgType: 'Non-US Organization', employeeCount: size }).queue).toBe(QUEUES.INTERNATIONAL);
    });
  });
});

describe('Fallback routing', () => {
  test('Unknown org type → Inside Sales', () => {
    expect(routeB2B({ orgType: 'Something Unknown', employeeCount: '251+' }).queue).toBe(QUEUES.INSIDE_SALES);
  });
  test('Other → Inside Sales always', () => {
    ['<25','26-100','101-250','251+'].forEach(size => {
      expect(routeB2B({ orgType: 'Other', employeeCount: size }).queue).toBe(QUEUES.INSIDE_SALES);
    });
  });
});

// -- Account owner override --
describe('Account owner override', () => {
  test('CS&E owned account always goes to CS&E', () => {
    const r = routeB2B({
      orgType: 'Accounting Firm',
      employeeCount: '251+',
      existingAccountOwner: { name: 'Jenae Klinke', team: 'Customer Success & Expansion' },
    });
    expect(r.queue).toBe(QUEUES.CS_EXPANSION);
    expect(r.rep).toBe('Jenae Klinke');
  });

  test('Existing owner from other team overrides matrix', () => {
    const r = routeB2B({
      orgType: 'Accounting Firm',
      employeeCount: '<25',
      existingAccountOwner: { name: 'Andrea Jennings', team: 'Global Firms' },
    });
    expect(r.queue).toBe('Global Firms');
    expect(r.rep).toBe('Andrea Jennings');
  });
});

// -- Full routeLead --
describe('routeLead', () => {
  test('B2B path sets leadType and sfRecordType', () => {
    const r = routeLead({ intentPath: 'b2b', orgType: 'University', employeeCount: '26-100' });
    expect(r.leadType).toBe('B2B');
    expect(r.sfRecordType).toBe('B2B_Lead');
    expect(r.queue).toBe(QUEUES.UNIVERSITY);
  });

  test('B2C exploring path sets journey', () => {
    const r = routeLead({ intentPath: 'exploring', productInterest: 'Certified Public Accountant' });
    expect(r.leadType).toBe('B2C');
    expect(r.journey).toBe('CPA Demo Journey');
  });

  test('Support path routes to CS&E', () => {
    const r = routeLead({ intentPath: 'support' });
    expect(r.queue).toBe(QUEUES.CS_EXPANSION);
  });
});
