import { useState } from 'react';

interface FormTextAreaProps {
  label: string;
  name: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  rows?: number;
}

export function FormTextArea({
  label,
  name,
  required = false,
  value,
  onChange,
  error,
  placeholder,
  rows = 4,
}: FormTextAreaProps) {
  const [isFocused, setIsFocused] = useState(false);
  const isFilled = value.length > 0;

  return (
    <div className="w-full">
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
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-4 py-3 transition-all duration-200 outline-none resize-vertical"
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
        <p
          className="mt-1.5 text-[13px]"
          style={{
            color: 'var(--becker-raspberry-flash)',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-normal)'
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
