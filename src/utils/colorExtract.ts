/**
 * Extracts up to 5 dominant non-neutral hex colors from an uploaded logo image Data URL
 * using an offscreen HTML5 canvas pixel sampler.
 */
export async function extractLogoColors(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(['#B45309', '#0F766E', '#1D4ED8', '#7C2D12']);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map<string, { r: number; g: number; b: number; count: number; score: number }>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 140) continue;

          // Skip near-white and near-black background pixels
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          if (lum > 242 || lum < 18) continue;

          const sat = max === min ? 0 : (max - min) / (lum > 127 ? 510 - max - min : max + min);
          // Quantize into 24-step buckets so similar shades group together
          const qr = Math.round(r / 24) * 24;
          const qg = Math.round(g / 24) * 24;
          const qb = Math.round(b / 24) * 24;
          const key = `${qr},${qg},${qb}`;

          const prev = buckets.get(key);
          const weight = 1 + sat * 2.5;
          if (prev) {
            prev.r += r;
            prev.g += g;
            prev.b += b;
            prev.count += 1;
            prev.score += weight;
          } else {
            buckets.set(key, { r, g, b, count: 1, score: weight });
          }
        }

        const sorted = Array.from(buckets.values())
          .sort((a, b) => b.score - a.score)
          .map((bucket) => {
            const avgR = Math.min(255, Math.round(bucket.r / bucket.count));
            const avgG = Math.min(255, Math.round(bucket.g / bucket.count));
            const avgB = Math.min(255, Math.round(bucket.b / bucket.count));
            return `#${[avgR, avgG, avgB].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
          });

        // Deduplicate very close colors
        const distinct: string[] = [];
        for (const hex of sorted) {
          if (distinct.every((existing) => colorDistance(existing, hex) > 48)) {
            distinct.push(hex);
          }
          if (distinct.length >= 5) break;
        }

        resolve(distinct.length > 0 ? distinct : ['#B45309', '#0F766E', '#1D4ED8', '#334155']);
      } catch {
        resolve(['#B45309', '#0F766E', '#1D4ED8', '#334155']);
      }
    };
    img.onerror = () => resolve(['#B45309', '#0F766E', '#1D4ED8', '#334155']);
    img.src = dataUrl;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [180, 83, 9];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * Returns '#FFFFFF' or '#111827' depending on WCAG relative luminance of the hex background.
 */
export function getContrastTextColor(hex: string): '#FFFFFF' | '#111827' {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#FFFFFF';
}

/**
 * Converts a hex color into an rgba string for subtle tinted backgrounds & borders.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
