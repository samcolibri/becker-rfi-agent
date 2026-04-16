import { motion } from 'motion/react';
import React, { ReactNode } from 'react';

interface IntentTileProps {
  icon: ReactNode;
  label: string;
  subtext?: string;
  selected: boolean;
  onClick: () => void;
  index: number;
}

export function IntentTile({ icon, label, subtext, selected, onClick, index }: IntentTileProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative p-6 transition-all duration-200 text-left overflow-hidden"
      style={{
        backgroundColor: selected ? 'var(--becker-tile-selected-bg)' : isHovered ? 'var(--becker-tile-hover-bg)' : 'var(--becker-white)',
        borderRadius: '10px',
        borderStyle: 'solid',
        borderWidth: selected ? '2px' : isHovered ? '1.5px' : '1px',
        borderColor: selected ? 'var(--becker-collegiate-blue)' : isHovered ? 'var(--becker-trusted-teal)' : 'var(--becker-border-default)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex flex-col gap-3">
        <div>{icon}</div>
        <div>
          <p
            className="text-[16px] leading-snug"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--becker-collegiate-blue)',
              fontWeight: 'var(--font-weight-bold)',
            }}
          >
            {label}
          </p>
          {subtext && (
            <p
              className="text-[13px] leading-snug mt-1"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--becker-cool-gray-11)',
                fontWeight: 'var(--font-weight-normal)',
              }}
            >
              {subtext}
            </p>
          )}
        </div>
      </div>
      {selected && (
        <motion.div
          className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--becker-collegiate-blue)' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
        >
          <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
            <path
              d="M1 5.5L5 9.5L13 1.5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      )}
    </motion.button>
  );
}
