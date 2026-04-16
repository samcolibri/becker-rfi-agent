import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';

interface FormSelectProps {
  label: string;
  name: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  halfWidth?: boolean;
  error?: string;
}

export function FormSelect({
  label,
  name,
  required = false,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  halfWidth = false,
  error,
}: FormSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className={halfWidth ? 'flex-1 min-w-0' : 'w-full'}>
      <label
        htmlFor={name}
        className="block mb-2 text-[13px]"
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 'var(--font-weight-normal)',
          color: error ? 'var(--becker-raspberry-flash)' : 'var(--becker-cool-gray-11)'
        }}
      >
        {label} {required && <span style={{ color: 'var(--becker-raspberry-flash)' }}>*</span>}
      </label>
      <div className="relative">
        <motion.button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          className="w-full px-4 py-3 transition-all duration-200 outline-none text-left flex items-center justify-between"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-normal)',
            backgroundColor: 'var(--becker-white)',
            borderRadius: '6px',
            borderWidth: error || isFocused || isOpen ? '2px' : '1px',
            borderStyle: 'solid',
            borderColor: error
              ? 'var(--becker-raspberry-flash)'
              : isFocused || isOpen
              ? 'var(--becker-backup-blue)'
              : 'var(--becker-border-input)',
            color: value ? 'var(--becker-collegiate-blue)' : 'var(--becker-cool-gray-11)',
          }}
          animate={{
            scale: isFocused || isOpen ? 1.01 : 1,
          }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <span>{selectedOption ? selectedOption.label : placeholder}</span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ color: 'var(--becker-cool-gray-11)' }}
          >
            <ChevronDown size={20} />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="absolute z-50 w-full mt-2 overflow-hidden shadow-xl"
              style={{
                backgroundColor: 'var(--becker-white)',
                borderRadius: '6px',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#E0E0E0',
              }}
            >
              <div className="max-h-64 overflow-y-auto">
                {options.map((option, index) => (
                  <motion.button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left transition-colors"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 'var(--font-weight-normal)',
                      backgroundColor: value === option.value ? 'var(--becker-tile-selected-bg)' : 'var(--becker-white)',
                      color: 'var(--becker-collegiate-blue)',
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#F4F4F4';
                    }}
                    onMouseLeave={(e) => {
                      if (value !== option.value) {
                        e.currentTarget.style.backgroundColor = 'var(--becker-white)';
                      } else {
                        e.currentTarget.style.backgroundColor = 'var(--becker-tile-selected-bg)';
                      }
                    }}
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-[13px]"
          style={{
            color: 'var(--becker-raspberry-flash)',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-normal)'
          }}
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
