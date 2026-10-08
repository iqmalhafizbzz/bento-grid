/**
 * Arc's shared motion presets, tuned for this app: every duration is half of Arc's default
 * (2x faster) and springs settle without overshoot so all movement reads as smooth.
 * Arc's originals: durations 0.12/0.16/0.18/0.24/0.48s, spring visualDurations 0.26/0.4/0.42s.
 */
export const motionTokens = {
  duration: { instant: 0.06, fast: 0.08, exit: 0.09, standard: 0.12, considered: 0.24 },
  ease: {
    enter: [0.16, 1, 0.3, 1],
    exit: [0.7, 0, 0.84, 0],
    standard: [0.22, 1, 0.36, 1],
    /** For elements that move while already on screen. */
    inOut: [0.65, 0, 0.35, 1],
  },
  spring: {
    // Twice as fast: 4x stiffness, 2x damping keeps the same damping ratio.
    responsive: { type: "spring", stiffness: 2080, damping: 76 },
    gentle: { type: "spring", stiffness: 1360, damping: 68 },
    /** Presses, toggles, thumbs, and small indicators. */
    snappy: { type: "spring", visualDuration: 0.13, bounce: 0 },
    /** Panels, height changes, and layout shifts. Critically damped, never overshoots. */
    smooth: { type: "spring", visualDuration: 0.2, bounce: 0 },
    /** Shape morphs, shared layout highlights, and width changes that follow new content. */
    morph: { type: "spring", visualDuration: 0.21, bounce: 0 },
  },
  /** Stagger steps in seconds. */
  stagger: { char: 0.008, word: 0.02, line: 0.04, item: 0.0175 },
  /** Blur radii in px for text and content crossfades. Keep blur small and brief. */
  blur: { subtle: 2, soft: 4, text: 8 },
} as const;
