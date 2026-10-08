export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }

export type MediaKind = 'image' | 'video'

export interface MediaRef {
  id: string
  kind: MediaKind
  mime: string
  /** Natural pixel size, needed to compute crop overflow. */
  width: number
  height: number
  /** Zoom on top of "cover", >= 1. */
  zoom: number
  /** Focus point 0..1 – where the visible window sits inside the overflow. */
  x: number
  y: number
  /** 'cover' fills the box and crops (default). 'free' keeps the media's shape and places it anywhere. */
  mode?: 'cover' | 'free'
  /** Free placement, relative to the box: width as a fraction of box width, centre point as fractions. */
  free?: FreePlacement
}

export interface FreePlacement {
  w: number
  x: number
  y: number
}

export type HAlign = 'start' | 'center' | 'end'
export type VAlign = 'start' | 'center' | 'end'
export type FontFamily = 'sans' | 'serif' | 'mono'

export interface TextContent {
  title: string
  subtitle: string
  color: string
  titleSize: number
  subtitleSize: number
  align: HAlign
  valign: VAlign
  font: FontFamily
}

/** A box is a stack of layers: fill at the bottom, then optional media, then optional text. */
export interface Cell {
  id: string
  col: number
  row: number
  w: number
  h: number
  fill: Fill
  /** Fill removed with the panel's minus button. The last fill is kept so + restores it. */
  fillOff?: boolean
  /** Fill hidden with the eye button. */
  fillHidden?: boolean
  media: MediaRef | null
  mediaHidden?: boolean
  text: TextContent
  /** Whether the text layer is shown. The text is kept when hidden. */
  textOn: boolean
}

export type Background =
  | { kind: 'color'; color: string }
  | { kind: 'image'; media: MediaRef }

export interface BentoDoc {
  version: 1
  /** "fit" means the bento fills whatever screen shows it. */
  sizeMode: 'fixed' | 'fit'
  width: number
  height: number
  cols: number
  rows: number
  gapX: number
  gapY: number
  padding: number
  radius: number
  background: Background
  /** Background removed (minus) or hidden (eye): the canvas is transparent. */
  backgroundOff?: boolean
  backgroundHidden?: boolean
  /** One stroke drawn inside every box's edge. Older saves have none. */
  stroke?: Stroke
  cells: Cell[]
}

export interface Stroke {
  on: boolean
  width: number
  color: string
  hidden?: boolean
}

export interface Rect {
  col: number
  row: number
  w: number
  h: number
}
