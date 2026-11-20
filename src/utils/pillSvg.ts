/**
 * Pill SVG builder: Generates custom SVG pill icons for all shapes and colors
 * Used in medication cards, dose displays, and cabinet inventory
 */

import type { PILL_COLORS } from '../db/schema';

type PillShape = 'round' | 'oval' | 'capsule';
type PillColor = keyof typeof PILL_COLORS;

export function renderPillSVG(shape: PillShape, colorKey: PillColor, size = 34): string {
  const palette = {
    teal: { fill: '#0d9488', accent: '#99f6e4', bg: 'bg-teal-50' },
    amber: { fill: '#d97706', accent: '#fde68a', bg: 'bg-amber-50' },
    rose: { fill: '#e11d48', accent: '#fecdd3', bg: 'bg-rose-50' },
    blue: { fill: '#0284c7', accent: '#bae6fd', bg: 'bg-sky-50' },
    indigo: { fill: '#4f46e5', accent: '#c7d2fe', bg: 'bg-indigo-50' },
  }[colorKey] || { fill: '#0d9488', accent: '#99f6e4', bg: 'bg-teal-50' };

  if (shape === 'capsule') {
    // Capsule: Elongated with two half-cylinder ends
    // Top half = one color, bottom half = accent stripe
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Main capsule body (rotated for visual depth) -->
        <g transform="rotate(-35 18 18)">
          <rect x="6" y="12" width="24" height="12" rx="6" fill="${palette.fill}"/>
          <!-- Accent stripe on lower half -->
          <ellipse cx="18" cy="20" rx="12" ry="3" fill="${palette.accent}" opacity="0.6"/>
        </g>
        <!-- Highlight shine -->
        <ellipse cx="14" cy="12" rx="6" ry="3" fill="white" opacity="0.25"/>
      </svg>`;
  }

  if (shape === 'oval') {
    // Scored oval tablet with center dividing line
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Main oval body -->
        <ellipse cx="18" cy="18" rx="13" ry="8" transform="rotate(-25 18 18)" fill="${palette.fill}"/>
        <!-- Center score line (white divider) -->
        <line x1="15" y1="12" x2="21" y2="24" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
        <!-- Highlight -->
        <ellipse cx="16" cy="14" rx="4" ry="2" fill="white" opacity="0.3"/>
      </svg>`;
  }

  // Round tablet (default) with center scoring
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Main circular tablet -->
      <circle cx="18" cy="18" r="11" fill="${palette.fill}"/>
      <!-- Center score line (white cross for round tablets) -->
      <line x1="11" y1="18" x2="25" y2="18" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
      <!-- Subtle highlight for depth -->
      <circle cx="14" cy="12" r="3" fill="white" opacity="0.25"/>
    </svg>`;
}

/**
 * Returns the CSS class for the pill background container
 * Used in UI cards to match pill color theme
 */
export function getPillBgClass(colorKey: PillColor): string {
  const bgClasses = {
    teal: 'bg-teal-50',
    amber: 'bg-amber-50',
    rose: 'bg-rose-50',
    blue: 'bg-sky-50',
    indigo: 'bg-indigo-50',
  };
  return bgClasses[colorKey] || 'bg-teal-50';
}

/**
 * Returns pill color palette for styling
 */
export function getPillPalette(colorKey: PillColor) {
  return {
    teal: { fill: '#0d9488', accent: '#99f6e4', bg: 'bg-teal-50' },
    amber: { fill: '#d97706', accent: '#fde68a', bg: 'bg-amber-50' },
    rose: { fill: '#e11d48', accent: '#fecdd3', bg: 'bg-rose-50' },
    blue: { fill: '#0284c7', accent: '#bae6fd', bg: 'bg-sky-50' },
    indigo: { fill: '#4f46e5', accent: '#c7d2fe', bg: 'bg-indigo-50' },
  }[colorKey] || { fill: '#0d9488', accent: '#99f6e4', bg: 'bg-teal-50' };
}

/**
 * Generate HTML for pill display (used in template rendering)
 */
export function getPillHTML(shape: PillShape, colorKey: PillColor, size = 34): string {
  return renderPillSVG(shape, colorKey, size);
}
