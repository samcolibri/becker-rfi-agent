import { motion } from 'motion/react';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  stepLabel?: string;
}

export function ProgressBar({ currentStep, totalSteps, stepLabel }: ProgressBarProps) {
  const percentage = (currentStep / totalSteps) * 100;

  return (
    <div className="mb-8">
      <div className="relative overflow-hidden" style={{ height: '4px', backgroundColor: '#E0E0E0' }}>
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ backgroundColor: 'var(--becker-collegiate-blue)' }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        />
      </div>
      {stepLabel && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-3 text-[13px]"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-normal)',
            color: 'var(--becker-cool-gray-11)',
          }}
        >
          {stepLabel}
        </motion.p>
      )}
    </div>
  );
}
