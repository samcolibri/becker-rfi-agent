import { useState } from 'react';
import { motion } from 'motion/react';

interface FormInputProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'tel';
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  halfWidth?: boolean;
}

export function FormInput({
  label,
  name,
  type = 'text',
  required = false,
  value,
  onChange,
  error,
  placeholder,
  halfWidth = false,
}: FormInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const isFilled = value.length > 0;

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
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="w-full px-4 py-3 transition-all duration-200 outline-none"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-normal)',
            backgroundColor: 'var(--becker-white)',
            borderRadius: '6px',
            borderWidth: error || isFocused ? '2px' : '1px',
            borderStyle: 'solid',
            borderColor: error
              ? 'var(--becker-raspberry-flash)'
              : isFocused
              ? 'var(--becker-backup-blue)'
              : 'var(--becker-border-input)',
            color: 'var(--becker-collegiate-blue)',
          }}
        />
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
