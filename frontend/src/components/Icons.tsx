import React from 'react';

export const SonarPingMark: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="13" stroke="#2A6F72" strokeWidth="1.5" strokeDasharray="3 3" />
    <circle cx="16" cy="16" r="8" stroke="#4EA5A8" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="3.2" fill="#FF6B4A" />
    <path d="M16 3V7M16 25V29M3 16H7M25 16H29" stroke="#4EA5A8" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const DepthStrataIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M2 5H18M4 10H16M6 15H14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const LakehouseGridIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="2.5" y="2.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="11.5" y="2.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="11.5" y="11.5" width="6" height="6" rx="1.2" stroke="#FF6B4A" strokeWidth="1.6" />
  </svg>
);
