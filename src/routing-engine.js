const routingMatrix = require('../data/routing-matrix.json');
const territoriesData = require('../data/territories.json');

const QUEUES = {
  CS_EXPANSION: 'Customer Success & Expansion',
  GLOBAL_FIRMS: 'Global Firms',
  INSIDE_SALES: 'Inside Sales',
  INTERNATIONAL: 'International',
  NCA: 'New Client Acquisition',
  UNIVERSITY: 'University',
};

// Normalize employee count ranges from form value to matrix key
function normalizeSize(size) {
  if (!size) return '<25';
  const s = String(size).trim();
  if (s === '<25' || s === '1-10' || s === '11-25') return '<25';
  if (s === '26-100' || s === '26-50' || s === '51-100') return '26-100';
  if (s === '101-250') return '101-250';
  if (s === '251+' || s === '251-500' || s === '500+') return '251+';
  return '<25';
}

// Route a B2B lead — returns { queue, rep, reason }
function routeB2B({ orgType, employeeCount, state, existingAccountOwner, accountType }) {
  // Rule 1: CS&E owned account always goes back to CS&E
  if (existingAccountOwner && existingAccountOwner.team === 'Customer Success & Expansion') {
    return {
      queue: QUEUES.CS_EXPANSION,
      rep: existingAccountOwner.name,
      reason: 'Existing CS&E account owner'
    };
  }

  // Rule 2: Existing account owner from any other team
  if (existingAccountOwner) {
    return {
      queue: existingAccountOwner.team,
      rep: existingAccountOwner.name,
      reason: 'Existing account owner'
    };
  }

  // Rule 3: Apply routing matrix
  const normalizedSize = normalizeSize(employeeCount);
  const matrix = routingMatrix[orgType];

  if (!matrix) {
    return {
      queue: QUEUES.INSIDE_SALES,
      rep: null,
      reason: `Unknown org type "${orgType}" — defaulting to Inside Sales`
    };
  }

  const queue = matrix[normalizedSize] || QUEUES.INSIDE_SALES;

  // Rule 4: Phase 2 — NCA territory matching
  if (queue === QUEUES.NCA && state) {
    const rep = matchNCATerritory(state, accountType);
    if (rep) {
      return { queue, rep: rep.name, reason: `NCA territory match — ${state}` };
    }
  }

  return { queue, rep: null, reason: `Matrix: ${orgType} × ${normalizedSize}` };
}

// Phase 2 NCA territory lookup
function matchNCATerritory(state, accountType) {
  const stateUpper = state.toUpperCase().trim();

  for (const rep of territoriesData.reps) {
    const stateMatch = rep.states.includes(stateUpper) ||
      (rep.stateRegions && matchRegion(stateUpper, rep.stateRegions));

    if (stateMatch) {
      // If accountType provided, prefer the rep whose accountTypes match
      if (accountType && rep.accountTypes.includes(accountType)) return rep;
      if (!accountType) return rep;
    }
  }
  return null;
}

function matchRegion(state, regions) {
  const REGION_MAP = {
    'CA-NORTH': ['CA'], // simplified — in prod, use zip code ranges
    'CA-SOUTH': ['CA'],
    'TX-WEST': ['TX'],
  };
  return regions.some(r => REGION_MAP[r] && REGION_MAP[r].includes(state));
}

// Route a B2C/individual lead — returns { queue, journey, reason }
function routeB2C({ intentPath, programOfInterest, productInterest, isCurrentStudent }) {
  // Accept either field name
  programOfInterest = programOfInterest || productInterest;
  if (intentPath === 'support') {
    return {
      queue: QUEUES.CS_EXPANSION,
      journey: null,
      reason: 'Student support path — routed to CS&E'
    };
  }

  const journey = mapProgramToJourney(programOfInterest);

  return {
    queue: null, // B2C goes to SFMC nurture, no direct rep assignment
    journey,
    reason: `B2C ${intentPath} path — SFMC journey: ${journey}`
  };
}

function mapProgramToJourney(program) {
  const journeyMap = {
    'Certified Public Accountant': 'CPA Demo Journey',
    'Certified Management Accountant': 'CMA Demo Journey',
    'Continuing Professional Education': 'CPE Free Demo Takers',
    'Certified Internal Auditor': 'CIA Demo Journey',
    'Enrolled Agent': 'EA Demo Journey',
    'Certified Financial Planner': 'CFP Demo Journey',
    'CIA Challenge Exam': 'CIA Demo Journey',
    'Staff Level Training': 'CPE Free Demo Takers',
  };
  return journeyMap[program] || 'General Nurture Journey';
}

// Main entry point — routes any form submission
function routeLead(submission) {
  const { intentPath } = submission;

  if (intentPath === 'b2b') {
    return {
      leadType: 'B2B',
      sfRecordType: 'B2B_Lead',
      ...routeB2B(submission)
    };
  }

  return {
    leadType: 'B2C',
    sfRecordType: 'B2C_Lead',
    ...routeB2C(submission)
  };
}

module.exports = { routeLead, routeB2B, routeB2C, normalizeSize, mapProgramToJourney, QUEUES };
