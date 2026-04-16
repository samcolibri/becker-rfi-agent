import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IntentTile } from './components/IntentTile';
import { FormInput } from './components/FormInput';
import { FormSelect } from './components/FormSelect';
import { FormTextArea } from './components/FormTextArea';
import { ProgressBar } from './components/ProgressBar';
import { GraduationCapIcon, CheckmarkCircleIcon, GroupPeopleIcon, GearIcon } from './components/BeckerIcons';
import { ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';

type Intent = 'exploring' | 'enrolling' | 'organization' | 'support' | null;
type RequestingFor = 'myself' | 'organization' | null;

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organizationName: string;
  organizationId: string;
  roleType: string;
  organizationType: string;
  productInterest: string;
  numEmployees: string;
  hqState: string;
  residenceState: string;
  examYear: string;
  isCurrentStudent: string;
  beckerEmail: string;
  country: string;
  city: string;
  state: string;
  supportMessage: string;
  consentMarketing: boolean;
  privacyConsent: boolean;
}

const initialFormData: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  organizationName: '',
  organizationId: '',
  roleType: '',
  organizationType: '',
  productInterest: '',
  numEmployees: '',
  hqState: '',
  residenceState: '',
  examYear: '',
  isCurrentStudent: '',
  beckerEmail: '',
  country: '',
  city: '',
  state: '',
  supportMessage: '',
  consentMarketing: false,
  privacyConsent: false,
};

const PRODUCT_MAP: Record<string, string> = {
  cfp: 'Certified Financial Planner',
  cia: 'Certified Internal Auditor',
  cma: 'Certified Management Accountant',
  cpa: 'Certified Public Accountant',
  cpe: 'Continuing Professional Education',
  ea: 'Enrolled Agent',
  'staff-training': 'Staff Level Training',
  'cia-challenge': 'CIA Challenge Exam',
};

const ORG_TYPE_MAP: Record<string, string> = {
  'accounting-firm': 'Accounting Firm',
  corporation: 'Corp/Healthcare/Bank/Financial Institution',
  'consulting-firm': 'Consulting Firm',
  'cpa-alliance': 'CPA Alliance',
  government: 'Gov Agency/Not-for-Profit',
  society: 'Society/Chapter',
  'non-us': 'Non-US Organization',
  student: 'Student',
  university: 'University',
  other: 'Other',
  none: '',
};

const ROLE_MAP: Record<string, string> = {
  undergrad: 'Undergrad Student',
  grad: 'Grad Student',
  professor: 'Professor',
  supervisor: 'Supervisor/Director/Manager',
  partner: 'Partner/CEO/CFO',
  administrator: 'Administrator',
  unemployed: 'Unemployed',
  'learning-leader': 'Learning/Training Leader',
  'staff-accountant': 'Staff Accountant',
  other: 'Other',
};

const EMP_MAP: Record<string, string> = {
  'less-than-25': '<25',
  '26-100': '26-100',
  '101-250': '101-250',
  '251+': '251+',
};

export default function App() {
  const [step, setStep] = useState(1);
  const [substep, setSubstep] = useState<'main' | 'secondary'>('main');
  const [intent, setIntent] = useState<Intent>(null);
  const [requestingFor, setRequestingFor] = useState<RequestingFor>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [utmParams, setUtmParams] = useState<Record<string, string>>({});

  const [orgSuggestions, setOrgSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [showOrgSuggestions, setShowOrgSuggestions] = useState(false);
  const orgSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
      const v = params.get(k);
      if (v) utm[k] = v;
    });
    setUtmParams(utm);
  }, []);

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleOrgNameChange = (value: string) => {
    updateField('organizationName', value);
    updateField('organizationId', '');
    if (orgSearchTimer.current) clearTimeout(orgSearchTimer.current);
    if (value.length < 2) {
      setShowOrgSuggestions(false);
      return;
    }
    orgSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/accounts?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        setOrgSuggestions(data);
        setShowOrgSuggestions(data.length > 0);
      } catch {
        setShowOrgSuggestions(false);
      }
    }, 300);
  };

  const selectOrgSuggestion = (item: { id: string; name: string }) => {
    updateField('organizationName', item.name);
    updateField('organizationId', item.id);
    setShowOrgSuggestions(false);
  };

  const validateStep2 = () => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    const isSupportForm = intent === 'support';
    const isB2BForm = requestingFor === 'organization';

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!formData.email.includes('@')) newErrors.email = 'Enter a valid email address';

    if (isSupportForm) {
      if (!formData.country) newErrors.country = 'Country is required';
      if (!formData.productInterest) newErrors.productInterest = 'Product interest is required';
    } else {
      if (!formData.roleType) newErrors.roleType = 'Role type is required';
      if (!formData.productInterest) newErrors.productInterest = 'Product interest is required';
      if (isB2BForm) {
        if (!formData.organizationName.trim()) newErrors.organizationName = 'Organization name is required';
        if (!formData.organizationType) newErrors.organizationType = 'Organization type is required';
        if (!formData.numEmployees) newErrors.numEmployees = 'Number of employees is required';
        if (!formData.hqState) newErrors.hqState = 'Headquarters state is required';
      } else {
        if (!formData.organizationType) newErrors.organizationType = 'Organization type is required';
        if (!formData.residenceState) newErrors.residenceState = 'State of residence is required';
      }
    }

    if (!formData.consentMarketing) newErrors.consentMarketing = 'Please accept to continue';
    if (!formData.privacyConsent) newErrors.privacyConsent = 'Please accept to continue';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getIntentPath = () => {
    if (intent === 'support') return 'support';
    if (intent === 'enrolling') return 'ready';
    if (intent === 'organization') return 'b2b';
    if (intent === 'exploring') return requestingFor === 'organization' ? 'b2b' : 'exploring';
    return 'exploring';
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;
    setSubmitting(true);
    setSubmitError(null);

    const intentPath = getIntentPath();
    const payload = {
      intentPath,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone || null,
      productInterest: PRODUCT_MAP[formData.productInterest] || formData.productInterest || null,
      roleType: ROLE_MAP[formData.roleType] || null,
      orgType: ORG_TYPE_MAP[formData.organizationType] || null,
      orgName: formData.organizationName || null,
      orgSize: EMP_MAP[formData.numEmployees] || null,
      state: formData.hqState || formData.residenceState || null,
      graduationYear: formData.examYear || null,
      beckerStudentEmail: formData.beckerEmail || null,
      message: formData.supportMessage || null,
      supportTopic: intentPath === 'support'
        ? (PRODUCT_MAP[formData.productInterest] || formData.productInterest || null)
        : null,
      consentGiven: formData.consentMarketing,
      privacyConsent: formData.privacyConsent,
      ...utmParams,
    };

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setSuccessMessage(data.message || 'Thank you! A Becker representative will be in touch shortly.');
      setStep(3);
    } catch {
      setSubmitError('Unable to submit. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (substep === 'main' && intent) {
        if (intent === 'exploring') {
          setSubstep('secondary');
        } else if (intent === 'enrolling') {
          setRequestingFor('myself');
          setStep(2);
        } else if (intent === 'organization') {
          setRequestingFor('organization');
          setStep(2);
        } else if (intent === 'support') {
          setStep(2);
        }
      } else if (substep === 'secondary' && requestingFor) {
        setStep(2);
      }
    } else if (step === 2) {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setSubstep('main');
      setIntent(null);
      setRequestingFor(null);
      setSubmitError(null);
    } else if (step === 1 && substep === 'secondary') {
      setSubstep('main');
      setRequestingFor(null);
    }
  };

  const organizationTypesB2B = [
    { value: 'accounting-firm', label: 'Accounting Firm' },
    { value: 'corporation', label: 'Corporation/Healthcare/Bank/Financial Institution' },
    { value: 'consulting-firm', label: 'Consulting Firm' },
    { value: 'cpa-alliance', label: 'CPA Alliance' },
    { value: 'government', label: 'Government Agency/Not for Profit Organization' },
    { value: 'society', label: 'Society/Chapter' },
    { value: 'non-us', label: 'Non-US Organization' },
    { value: 'student', label: 'Student' },
    { value: 'university', label: 'University' },
    { value: 'other', label: 'Other' },
  ];

  const organizationTypesB2C = [
    { value: 'none', label: 'None' },
    { value: 'accounting-firm', label: 'Accounting Firm' },
    { value: 'corporation', label: 'Corporation/Healthcare/Bank/Financial Institution' },
    { value: 'consulting-firm', label: 'Consulting Firm' },
    { value: 'cpa-alliance', label: 'CPA Alliance' },
    { value: 'government', label: 'Government Agency/Not for Profit Organization' },
    { value: 'society', label: 'Society/Chapter' },
    { value: 'non-us', label: 'Non-US Organization' },
    { value: 'student', label: 'Student' },
    { value: 'university', label: 'University' },
    { value: 'other', label: 'Other' },
  ];

  const roleTypes = [
    { value: 'undergrad', label: 'Undergrad Student' },
    { value: 'grad', label: 'Grad Student' },
    { value: 'professor', label: 'Professor' },
    { value: 'supervisor', label: 'Supervisor/Director/Manager' },
    { value: 'partner', label: 'Partner/CEO/CFO' },
    { value: 'administrator', label: 'Administrator' },
    { value: 'unemployed', label: 'Unemployed' },
    { value: 'learning-leader', label: 'Learning/Training Leader' },
    { value: 'staff-accountant', label: 'Staff Accountant' },
    { value: 'other', label: 'Other' },
  ];

  const productInterests = [
    { value: 'cfp', label: 'Certified Financial Planner (CFP)' },
    { value: 'cia', label: 'Certified Internal Auditor (CIA)' },
    { value: 'cma', label: 'Certified Management Accountant (CMA)' },
    { value: 'cpa', label: 'Certified Public Accountant (CPA)' },
    { value: 'cpe', label: 'Continuing Professional Education (CPE)' },
    { value: 'ea', label: 'Enrolled Agent (EA)' },
    { value: 'staff-training', label: 'Staff Level Training' },
    { value: 'cia-challenge', label: 'CIA Challenge Exam' },
  ];

  const employeeRanges = [
    { value: 'less-than-25', label: 'Less than 25' },
    { value: '26-100', label: '26–100' },
    { value: '101-250', label: '101–250' },
    { value: '251+', label: '251+' },
  ];

  const states = [
    { value: 'AL', label: 'Alabama' },
    { value: 'AK', label: 'Alaska' },
    { value: 'AZ', label: 'Arizona' },
    { value: 'AR', label: 'Arkansas' },
    { value: 'CA', label: 'California' },
    { value: 'CO', label: 'Colorado' },
    { value: 'CT', label: 'Connecticut' },
    { value: 'DE', label: 'Delaware' },
    { value: 'FL', label: 'Florida' },
    { value: 'GA', label: 'Georgia' },
    { value: 'HI', label: 'Hawaii' },
    { value: 'ID', label: 'Idaho' },
    { value: 'IL', label: 'Illinois' },
    { value: 'IN', label: 'Indiana' },
    { value: 'IA', label: 'Iowa' },
    { value: 'KS', label: 'Kansas' },
    { value: 'KY', label: 'Kentucky' },
    { value: 'LA', label: 'Louisiana' },
    { value: 'ME', label: 'Maine' },
    { value: 'MD', label: 'Maryland' },
    { value: 'MA', label: 'Massachusetts' },
    { value: 'MI', label: 'Michigan' },
    { value: 'MN', label: 'Minnesota' },
    { value: 'MS', label: 'Mississippi' },
    { value: 'MO', label: 'Missouri' },
    { value: 'MT', label: 'Montana' },
    { value: 'NE', label: 'Nebraska' },
    { value: 'NV', label: 'Nevada' },
    { value: 'NH', label: 'New Hampshire' },
    { value: 'NJ', label: 'New Jersey' },
    { value: 'NM', label: 'New Mexico' },
    { value: 'NY', label: 'New York' },
    { value: 'NC', label: 'North Carolina' },
    { value: 'ND', label: 'North Dakota' },
    { value: 'OH', label: 'Ohio' },
    { value: 'OK', label: 'Oklahoma' },
    { value: 'OR', label: 'Oregon' },
    { value: 'PA', label: 'Pennsylvania' },
    { value: 'RI', label: 'Rhode Island' },
    { value: 'SC', label: 'South Carolina' },
    { value: 'SD', label: 'South Dakota' },
    { value: 'TN', label: 'Tennessee' },
    { value: 'TX', label: 'Texas' },
    { value: 'UT', label: 'Utah' },
    { value: 'VT', label: 'Vermont' },
    { value: 'VA', label: 'Virginia' },
    { value: 'WA', label: 'Washington' },
    { value: 'WV', label: 'West Virginia' },
    { value: 'WI', label: 'Wisconsin' },
    { value: 'WY', label: 'Wyoming' },
  ];

  const examYears = [
    { value: 'passed', label: 'Already passed' },
    { value: '2025', label: '2025' },
    { value: '2026', label: '2026' },
    { value: '2027', label: '2027' },
    { value: '2028', label: '2028' },
    { value: '2029', label: '2029' },
    { value: '2030', label: '2030' },
  ];

  const countries = [
    { value: 'US', label: 'United States' },
    { value: 'CA', label: 'Canada' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'AU', label: 'Australia' },
    { value: 'IN', label: 'India' },
    { value: 'CN', label: 'China' },
    { value: 'JP', label: 'Japan' },
    { value: 'DE', label: 'Germany' },
    { value: 'FR', label: 'France' },
    { value: 'BR', label: 'Brazil' },
    { value: 'MX', label: 'Mexico' },
    { value: 'OTHER', label: 'Other' },
  ];

  const isB2B = requestingFor === 'organization';
  const organizationTypes = isB2B ? organizationTypesB2B : organizationTypesB2C;

  const ConsentBlock = () => (
    <div className="space-y-3 pt-2">
      <label
        className="flex items-start gap-3 cursor-pointer"
        style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--becker-cool-gray-11)' }}
      >
        <input
          type="checkbox"
          checked={formData.consentMarketing}
          onChange={(e) => updateField('consentMarketing', e.target.checked)}
          className="mt-0.5 shrink-0"
          style={{ accentColor: 'var(--becker-collegiate-blue)', width: 16, height: 16 }}
        />
        <span>
          I agree to receive commercial marketing communications from Becker Professional Education. You may unsubscribe at any time.
        </span>
      </label>
      {errors.consentMarketing && (
        <p style={{ color: '#DC2626', fontSize: '12px', fontFamily: 'var(--font-body)' }}>{errors.consentMarketing}</p>
      )}
      <label
        className="flex items-start gap-3 cursor-pointer"
        style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--becker-cool-gray-11)' }}
      >
        <input
          type="checkbox"
          checked={formData.privacyConsent}
          onChange={(e) => updateField('privacyConsent', e.target.checked)}
          className="mt-0.5 shrink-0"
          style={{ accentColor: 'var(--becker-collegiate-blue)', width: 16, height: 16 }}
        />
        <span>
          I have read and agree to the{' '}
          <a
            href="https://www.becker.com/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--becker-collegiate-blue)', textDecoration: 'underline' }}
          >
            Privacy Policy
          </a>
          .
        </span>
      </label>
      {errors.privacyConsent && (
        <p style={{ color: '#DC2626', fontSize: '12px', fontFamily: 'var(--font-body)' }}>{errors.privacyConsent}</p>
      )}
    </div>
  );

  const SubmitButton = ({ label = 'Submit' }: { label?: string }) => (
    <div>
      {submitError && (
        <p
          className="mb-3 text-center text-sm"
          style={{ color: '#DC2626', fontFamily: 'var(--font-body)' }}
        >
          {submitError}
        </p>
      )}
      <motion.button
        onClick={handleNext}
        disabled={submitting}
        className="px-8 py-3 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 'var(--font-weight-bold)',
          backgroundColor: 'var(--becker-game-changer-yellow)',
          color: 'var(--becker-collegiate-blue)',
          borderRadius: '10px',
          border: 'none',
        }}
        whileHover={!submitting ? { scale: 1.02 } : {}}
        whileTap={!submitting ? { scale: 0.98 } : {}}
      >
        {submitting ? 'Submitting…' : label}
        {!submitting && <ArrowRight size={20} />}
      </motion.button>
    </div>
  );

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'var(--becker-cool-gray-2)' }}
    >
      <motion.div
        className="w-full max-w-[720px] shadow-lg p-10"
        style={{
          backgroundColor: 'var(--becker-white)',
          borderRadius: '10px',
          border: '1px solid var(--becker-border-default)',
        }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      >
        <AnimatePresence mode="wait">
          {step === 1 && substep === 'main' && (
            <motion.div
              key="step1-main"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <motion.h1
                className="mb-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  lineHeight: '1.2',
                  color: 'var(--becker-collegiate-blue)',
                  fontWeight: 'var(--font-weight-bold)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                What brings you here today?
              </motion.h1>

              <motion.p
                className="mb-8"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 'var(--font-weight-normal)',
                  color: 'var(--becker-cool-gray-11)',
                  fontSize: '1rem',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Select the option that best describes your needs
              </motion.p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <IntentTile
                  icon={<GraduationCapIcon size={32} color="var(--becker-collegiate-blue)" />}
                  label="I'm Exploring Courses"
                  subtext="Interested in CPA, CMA, CIA, EA, CPE, or CFP"
                  selected={intent === 'exploring'}
                  onClick={() => setIntent('exploring')}
                  index={0}
                />
                <IntentTile
                  icon={<CheckmarkCircleIcon size={32} color="var(--becker-collegiate-blue)" />}
                  label="I'm Ready to Enroll"
                  subtext="I know what I want and need to get started"
                  selected={intent === 'enrolling'}
                  onClick={() => setIntent('enrolling')}
                  index={1}
                />
                <IntentTile
                  icon={<GroupPeopleIcon size={32} color="var(--becker-collegiate-blue)" />}
                  label="I'm Buying for My Organization"
                  subtext="Firm, corporation, university, or government"
                  selected={intent === 'organization'}
                  onClick={() => setIntent('organization')}
                  index={2}
                />
                <IntentTile
                  icon={<GearIcon size={32} color="var(--becker-collegiate-blue)" />}
                  label="I Need Student Support"
                  subtext="I'm already enrolled and need help"
                  selected={intent === 'support'}
                  onClick={() => setIntent('support')}
                  index={3}
                />
              </div>

              <motion.button
                onClick={handleNext}
                disabled={!intent}
                className="w-full py-4 flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 'var(--font-weight-bold)',
                  backgroundColor: 'var(--becker-game-changer-yellow)',
                  color: 'var(--becker-collegiate-blue)',
                  borderRadius: '10px',
                  border: 'none',
                }}
                whileHover={intent ? { scale: 1.02 } : {}}
                whileTap={intent ? { scale: 0.98 } : {}}
              >
                Continue
                <ArrowRight size={20} />
              </motion.button>

              <motion.div
                className="mt-8 pt-8"
                style={{ borderTop: '1px solid var(--becker-border-default)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <p
                  className="text-[13px] mb-3"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-normal)',
                    color: 'var(--becker-cool-gray-11)',
                  }}
                >
                  Not ready to talk? Explore on your own first.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Try a free CPA demo', 'Browse CPE courses', 'View CMA packages'].map(
                    (label, idx) => (
                      <motion.button
                        key={label}
                        className="px-4 py-2 text-[13px] transition-all duration-200"
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 'var(--font-weight-semibold)',
                          borderRadius: '100px',
                          borderWidth: '1.5px',
                          borderStyle: 'solid',
                          borderColor: 'var(--becker-collegiate-blue)',
                          color: 'var(--becker-collegiate-blue)',
                          backgroundColor: 'rgba(255, 255, 255, 0)',
                        }}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + idx * 0.1 }}
                        whileHover={{ backgroundColor: 'var(--becker-tile-selected-bg)' }}
                      >
                        {label}
                      </motion.button>
                    )
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}

          {step === 1 && substep === 'secondary' && (
            <motion.div
              key="step1b-secondary"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ProgressBar currentStep={1} totalSteps={3} stepLabel="Step 1 of 3 — Tell us about you" />

              <motion.h1
                className="mb-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  lineHeight: '1.2',
                  color: 'var(--becker-collegiate-blue)',
                  fontWeight: 'var(--font-weight-bold)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                Are you exploring for yourself or your organization?
              </motion.h1>

              <motion.p
                className="mb-8"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 'var(--font-weight-normal)',
                  color: 'var(--becker-cool-gray-11)',
                  fontSize: '1rem',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                This helps us connect you with the right team.
              </motion.p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <IntentTile
                  icon={<GraduationCapIcon size={32} color="var(--becker-collegiate-blue)" />}
                  label="For Myself"
                  subtext="Individual exam prep and certification"
                  selected={requestingFor === 'myself'}
                  onClick={() => setRequestingFor('myself')}
                  index={0}
                />
                <IntentTile
                  icon={<GroupPeopleIcon size={32} color="var(--becker-collegiate-blue)" />}
                  label="For My Organization"
                  subtext="Training solutions for your team or firm"
                  selected={requestingFor === 'organization'}
                  onClick={() => setRequestingFor('organization')}
                  index={1}
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-[14px] transition-all duration-200 border-b-2 border-transparent hover:border-current"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--becker-backup-blue)',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <motion.button
                  onClick={handleNext}
                  disabled={!requestingFor}
                  className="px-8 py-4 flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-bold)',
                    backgroundColor: 'var(--becker-game-changer-yellow)',
                    color: 'var(--becker-collegiate-blue)',
                    borderRadius: '10px',
                    border: 'none',
                  }}
                  whileHover={requestingFor ? { scale: 1.02 } : {}}
                  whileTap={requestingFor ? { scale: 0.98 } : {}}
                >
                  Continue
                  <ArrowRight size={20} />
                </motion.button>
              </div>
            </motion.div>
          )}

          {step === 2 && isB2B && (
            <motion.div
              key="step2-b2b"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ProgressBar currentStep={2} totalSteps={3} stepLabel="Step 2 of 3 — Your details" />

              <motion.h2
                className="mb-6"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.75rem',
                  lineHeight: '1.3',
                  color: 'var(--becker-collegiate-blue)',
                  fontWeight: 'var(--font-weight-bold)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Tell us about your organization
              </motion.h2>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <FormInput
                    label="First Name"
                    name="firstName"
                    required
                    value={formData.firstName}
                    onChange={(v) => updateField('firstName', v)}
                    error={errors.firstName}
                    halfWidth
                  />
                  <FormInput
                    label="Last Name"
                    name="lastName"
                    required
                    value={formData.lastName}
                    onChange={(v) => updateField('lastName', v)}
                    error={errors.lastName}
                    halfWidth
                  />
                </div>

                <FormInput
                  label="Business Email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(v) => updateField('email', v)}
                  error={errors.email}
                />

                <FormInput
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(v) => updateField('phone', v)}
                />

                <div className="relative">
                  <FormInput
                    label="Organization Name"
                    name="organizationName"
                    required
                    value={formData.organizationName}
                    onChange={handleOrgNameChange}
                    error={errors.organizationName}
                  />
                  {showOrgSuggestions && (
                    <div
                      className="absolute z-10 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
                      style={{
                        backgroundColor: 'var(--becker-white)',
                        border: '1px solid var(--becker-border-default)',
                      }}
                    >
                      {orgSuggestions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectOrgSuggestion(item)}
                          className="w-full text-left px-4 py-2 text-sm transition-colors"
                          style={{
                            fontFamily: 'var(--font-body)',
                            color: 'var(--becker-collegiate-blue)',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--becker-tile-selected-bg)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
                          }}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <FormSelect
                    label="Organization Type"
                    name="organizationType"
                    required
                    value={formData.organizationType}
                    onChange={(v) => updateField('organizationType', v)}
                    options={organizationTypes}
                    placeholder="Select type"
                    halfWidth
                    error={errors.organizationType}
                  />
                  <FormSelect
                    label="Role Type"
                    name="roleType"
                    required
                    value={formData.roleType}
                    onChange={(v) => updateField('roleType', v)}
                    options={roleTypes}
                    halfWidth
                    error={errors.roleType}
                  />
                </div>

                <FormSelect
                  label="Product Interest"
                  name="productInterest"
                  required
                  value={formData.productInterest}
                  onChange={(v) => updateField('productInterest', v)}
                  options={productInterests}
                  placeholder="Select a product area"
                  error={errors.productInterest}
                />

                <div className="flex gap-3">
                  <FormSelect
                    label="Number of Employees"
                    name="numEmployees"
                    required
                    value={formData.numEmployees}
                    onChange={(v) => updateField('numEmployees', v)}
                    options={employeeRanges}
                    placeholder="Select range"
                    halfWidth
                    error={errors.numEmployees}
                  />
                  <FormSelect
                    label="Headquarters State or Province"
                    name="hqState"
                    required
                    value={formData.hqState}
                    onChange={(v) => updateField('hqState', v)}
                    options={states}
                    halfWidth
                    error={errors.hqState}
                  />
                </div>

                <ConsentBlock />
              </div>

              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-[14px] transition-all duration-200 border-b-2 border-transparent hover:border-current"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--becker-backup-blue)',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <SubmitButton />
              </div>
            </motion.div>
          )}

          {step === 2 && !isB2B && intent !== 'support' && (
            <motion.div
              key="step2-b2c"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ProgressBar currentStep={2} totalSteps={3} stepLabel="Step 2 of 3 — Your details" />

              <motion.h2
                className="mb-6"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.75rem',
                  lineHeight: '1.3',
                  color: 'var(--becker-collegiate-blue)',
                  fontWeight: 'var(--font-weight-bold)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Tell us about yourself
              </motion.h2>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <FormInput
                    label="First Name"
                    name="firstName"
                    required
                    value={formData.firstName}
                    onChange={(v) => updateField('firstName', v)}
                    error={errors.firstName}
                    halfWidth
                  />
                  <FormInput
                    label="Last Name"
                    name="lastName"
                    required
                    value={formData.lastName}
                    onChange={(v) => updateField('lastName', v)}
                    error={errors.lastName}
                    halfWidth
                  />
                </div>

                <FormInput
                  label="Email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(v) => updateField('email', v)}
                  error={errors.email}
                />

                <FormInput
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(v) => updateField('phone', v)}
                />

                <FormInput
                  label="Organization Name"
                  name="organizationName"
                  value={formData.organizationName}
                  onChange={(v) => updateField('organizationName', v)}
                />

                <div className="flex gap-3">
                  <FormSelect
                    label="Role Type"
                    name="roleType"
                    required
                    value={formData.roleType}
                    onChange={(v) => updateField('roleType', v)}
                    options={roleTypes}
                    halfWidth
                    error={errors.roleType}
                  />
                  <FormSelect
                    label="Organization Type"
                    name="organizationType"
                    required
                    value={formData.organizationType}
                    onChange={(v) => updateField('organizationType', v)}
                    options={organizationTypes}
                    halfWidth
                    error={errors.organizationType}
                  />
                </div>

                <FormSelect
                  label="Product Interest"
                  name="productInterest"
                  required
                  value={formData.productInterest}
                  onChange={(v) => updateField('productInterest', v)}
                  options={productInterests}
                  error={errors.productInterest}
                />

                <FormSelect
                  label="State or Province of Residence"
                  name="residenceState"
                  required
                  value={formData.residenceState}
                  onChange={(v) => updateField('residenceState', v)}
                  options={states}
                  error={errors.residenceState}
                />

                <FormSelect
                  label="What year do you plan to graduate?"
                  name="examYear"
                  value={formData.examYear}
                  onChange={(v) => updateField('examYear', v)}
                  options={examYears}
                />

                <div>
                  <label
                    className="block mb-3 text-[13px]"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 'var(--font-weight-normal)',
                      color: 'var(--becker-cool-gray-11)',
                    }}
                  >
                    Are you a current Becker student?
                  </label>
                  <div className="flex gap-4">
                    {['Yes', 'No'].map((option) => (
                      <motion.button
                        key={option}
                        type="button"
                        onClick={() => updateField('isCurrentStudent', option)}
                        className="flex-1 py-3 transition-all duration-200"
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 'var(--font-weight-semibold)',
                          backgroundColor:
                            formData.isCurrentStudent === option
                              ? 'var(--becker-tile-selected-bg)'
                              : 'var(--becker-white)',
                          borderRadius: '6px',
                          borderWidth: formData.isCurrentStudent === option ? '2px' : '1px',
                          borderStyle: 'solid',
                          borderColor:
                            formData.isCurrentStudent === option
                              ? 'var(--becker-collegiate-blue)'
                              : 'var(--becker-border-input)',
                          color: 'var(--becker-collegiate-blue)',
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {option}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {formData.isCurrentStudent === 'Yes' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                      className="overflow-hidden"
                    >
                      <FormInput
                        label="Email associated with your Becker account"
                        name="beckerEmail"
                        type="email"
                        value={formData.beckerEmail}
                        onChange={(v) => updateField('beckerEmail', v)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <ConsentBlock />
              </div>

              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-[14px] transition-all duration-200 border-b-2 border-transparent hover:border-current"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--becker-backup-blue)',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <SubmitButton />
              </div>
            </motion.div>
          )}

          {step === 2 && intent === 'support' && (
            <motion.div
              key="step2c-support"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ProgressBar currentStep={2} totalSteps={3} stepLabel="Step 2 of 3 — Your details" />

              <motion.h2
                className="mb-6"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.75rem',
                  lineHeight: '1.3',
                  color: 'var(--becker-collegiate-blue)',
                  fontWeight: 'var(--font-weight-bold)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                How can we help you?
              </motion.h2>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <FormInput
                    label="First Name"
                    name="firstName"
                    required
                    value={formData.firstName}
                    onChange={(v) => updateField('firstName', v)}
                    error={errors.firstName}
                    halfWidth
                  />
                  <FormInput
                    label="Last Name"
                    name="lastName"
                    required
                    value={formData.lastName}
                    onChange={(v) => updateField('lastName', v)}
                    error={errors.lastName}
                    halfWidth
                  />
                </div>

                <FormInput
                  label="Email associated with your Becker account"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(v) => updateField('email', v)}
                  error={errors.email}
                />

                <FormInput
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(v) => updateField('phone', v)}
                />

                <FormSelect
                  label="Country"
                  name="country"
                  required
                  value={formData.country}
                  onChange={(v) => updateField('country', v)}
                  options={countries}
                  placeholder="Select country"
                  error={errors.country}
                />

                <div className="flex gap-3">
                  <FormInput
                    label="City"
                    name="city"
                    value={formData.city}
                    onChange={(v) => updateField('city', v)}
                    halfWidth
                  />
                  <FormSelect
                    label="State"
                    name="state"
                    value={formData.state}
                    onChange={(v) => updateField('state', v)}
                    options={states}
                    placeholder="Select state"
                    halfWidth
                  />
                </div>

                <FormSelect
                  label="Product Interest"
                  name="productInterest"
                  required
                  value={formData.productInterest}
                  onChange={(v) => updateField('productInterest', v)}
                  options={productInterests}
                  error={errors.productInterest}
                />

                <FormTextArea
                  label="Please tell us about your question or comment"
                  name="supportMessage"
                  value={formData.supportMessage}
                  onChange={(v) => updateField('supportMessage', v)}
                  placeholder="Describe your question or issue..."
                  rows={4}
                />

                <ConsentBlock />
              </div>

              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-[14px] transition-all duration-200 border-b-2 border-transparent hover:border-current"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--becker-backup-blue)',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <SubmitButton label="Submit" />
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="text-center py-8"
            >
              <ProgressBar currentStep={3} totalSteps={3} />

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                className="mb-6 inline-flex"
              >
                <CheckCircle2
                  size={64}
                  style={{ color: 'var(--becker-trusted-teal)' }}
                  strokeWidth={2}
                />
              </motion.div>

              <motion.h2
                className="mb-3"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  lineHeight: '1.2',
                  color: 'var(--becker-collegiate-blue)',
                  fontWeight: 'var(--font-weight-bold)',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Thanks, {formData.firstName}!
              </motion.h2>

              <motion.p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  color: 'var(--becker-cool-gray-11)',
                  maxWidth: '480px',
                  margin: '0 auto',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                {successMessage}
              </motion.p>

              <motion.p
                className="mt-4 text-sm"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--becker-cool-gray-11)',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
              >
                Check your inbox — a confirmation email is on its way to {formData.email}.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
