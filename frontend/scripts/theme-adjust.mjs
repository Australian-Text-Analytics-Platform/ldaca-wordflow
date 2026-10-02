/**
 * Readability curve for a theme (issue 263): each RGB channel c in 0..1
 * becomes c ** gamma * brightness, alpha unchanged. Gamma darkens pale greys
 * (secondary text, borders, graph edges) while black stays black; brightness
 * below 1 softens pure white. The manifest keeps the exact upstream colours.
 */
export const adjustColor = (value, { gamma, brightness }) =>
  value.replace(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/, (_, rgb, alpha = '') => {
    const channels = [0, 2, 4].map((index) => {
      const channel = Number.parseInt(rgb.slice(index, index + 2), 16) / 255;
      return Math.round(255 * channel ** gamma * brightness)
        .toString(16)
        .padStart(2, '0');
    });
    return `#${channels.join('').toUpperCase()}${alpha.toUpperCase()}`;
  });
