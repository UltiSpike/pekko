// Maps uiohook-napi keycode to stereo pan value (-1.0 = left, 0.0 = center, +1.0 = right)
// Based on standard 104-key QWERTY US layout
// See: https://github.com/kwhat/libuiohook/blob/master/include/uiohook.h

// uiohook keycodes (partial list - common keys)
// Numbers represent physical key positions across ~15 columns
export const KEY_PAN_MAP: Record<number, number> = {
  // Row 1: Numbers & Escape
  1: -1.0,   // Escape
  2: -0.93,  // 1
  3: -0.86,  // 2
  4: -0.79,  // 3
  5: -0.72,  // 4
  6: -0.65,  // 5
  7: -0.58,  // 6
  8: -0.51,  // 7
  9: -0.44,  // 8
  10: -0.37, // 9
  11: -0.30, // 0
  12: -0.23, // Minus
  13: -0.16, // Equal
  14: 0.93,  // Backspace

  // Row 2: Tab & QWERTY
  15: -0.87, // Tab
  16: -0.60, // Q
  17: -0.53, // W
  18: -0.46, // E
  19: -0.39, // R
  20: -0.32, // T
  21: 0.32,  // Y
  22: 0.39,  // U
  23: 0.46,  // I
  24: 0.53,  // O
  25: 0.60,  // P
  26: 0.67,  // Left Bracket
  27: 0.74,  // Right Bracket
  28: 0.87,  // Backslash

  // Row 3: Caps Lock & ASDF
  29: -0.87, // Caps Lock
  30: -0.60, // A
  31: -0.53, // S
  32: -0.46, // D
  33: -0.39, // F
  34: -0.32, // G
  35: 0.32,  // H
  36: 0.39,  // J
  37: 0.46,  // K
  38: 0.53,  // L
  39: 0.60,  // Semicolon
  40: 0.67,  // Apostrophe
  41: 0.87,  // Return

  // Row 4: Shift & ZXCVB
  42: -0.87, // Left Shift
  43: -0.60, // Z
  44: -0.53, // X
  45: -0.46, // C
  46: -0.39, // V
  47: -0.32, // B
  48: 0.32,  // N
  49: 0.39,  // M
  50: 0.46,  // Comma
  51: 0.53,  // Period
  52: 0.60,  // Slash
  53: 0.87,  // Right Shift

  // Row 5: Space & modifiers
  54: -0.87, // Left Control
  55: -0.67, // Left Alt
  56: -0.50, // Left Super/Command
  57: 0.0,   // Space
  58: 0.50,  // Right Super/Command
  59: 0.67,  // Right Alt
  60: 0.87   // Right Control
}

const SPATIAL_SCALE = 0.35 // Real keyboard ~38cm at ~50cm distance ≈ ±21° ≈ ±0.35 pan

export function getKeyPan(keycode: number): number {
  return (KEY_PAN_MAP[keycode] ?? 0.0) * SPATIAL_SCALE
}
