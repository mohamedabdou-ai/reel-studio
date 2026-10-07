export const DOCTOR_CARD_TEXT_WIDTH = 760;


export const handleFontSize = (handle: string): number =>
  Math.max(24, Math.min(64, Math.floor(DOCTOR_CARD_TEXT_WIDTH / (0.62 * Math.max(1, handle.length)))));

export const nameFontSize = (name: string): number => (name.length > 40 ? 56 : name.length > 20 ? 72 : 88);

const channel = (hex: string, index: number): number => {
  const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

export const luminance = (hex: string): number => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);

export const readableOn = (background: string): string => (luminance(background) > 0.35 ? '#111111' : '#FFFFFF');
