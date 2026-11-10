"use client";

import {motion,useReducedMotion} from 'motion/react';
import paths from './folio-toggle-paths.json';

/** Matched SVG contours from Folio's existing DM Sans wordmark.
 * Each panel-icon segment becomes one letter; no images or font request. */
export function FolioToggleIcon({compact,animated}:{compact:boolean;animated:boolean}) {
  const reduced=useReducedMotion();
  return <span className="folio-toggle-art" data-compact={compact} data-animate={animated} aria-hidden="true">
    <svg width="88" height="28" viewBox="0 0 88 28" focusable="false">
      {paths.map((pair,index)=><motion.path key={index} initial={false}
        animate={{d:compact?pair.compact:pair.expanded}}
        transition={{duration:reduced||!animated?0:.24,ease:"linear"}}
        fill="currentColor" fillRule="evenodd"/>) }
    </svg>
  </span>;
}
