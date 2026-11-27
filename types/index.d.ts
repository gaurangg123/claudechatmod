// Shell Party's state contract: the person's choices, kept for the session in
// $.state (so drawings redraw when they change) and across sessions in $.store,
// and what the backdrop shows right now.

export type ShellPartyPrefs = {
  /** The pixel-art scene drawn behind the conversation (desktop and mobile apps). */
  backdrop: boolean
  /** The pixel skyline band above the prompt (terminal). */
  band: boolean
  /** Moving cars, rain, clouds and blinking lights in the scenes. */
  motion: boolean
  /** The scene on show while the slideshow is off. */
  scene: string
  /** Rotate through the scenes on a timer. */
  slideshow: boolean
  /** Minutes between scenes while the slideshow runs. */
  minutes: number
  /** Shifts the slideshow's clock-based order, so /party-shell next and /party-shell scene take effect. */
  offset: number
  /** Fireworks when a long task finishes, a red alert when tests fail. */
  reactions: boolean
  /** Which scenes the slideshow shows, and the text palette and glass that suit them. */
  mode: 'dark' | 'light'
}

/** What the backdrop draws now; a change redraws the picture alone. */
export type ShellPartyView = {
  scene: string
  /** A reaction drawn over the scene until `until` (ms since the epoch). */
  reaction?: 'party' | 'alert'
  until?: number
  /** Fade the scene in: true right after the scene changed. */
  fade: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'shell-party': { prefs: ShellPartyPrefs; view: ShellPartyView }
  }
}
