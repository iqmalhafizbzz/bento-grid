const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Modifier key prefix for shortcut hints. */
export const MOD = isMac ? '⌘' : 'Ctrl+'
