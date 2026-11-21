// Built-in feedback helper. It runs on the device and looks at colors, light and
// detail in the picture. It is not a real AI model. To connect a real AI service
// later, replace analyzeImage() with a call to your own server (see README.md).

export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { img.release = () => URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened. Try a different photo.')); };
    img.src = url;
  });
}

function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function measure(imageData, width, height) {
  const { data } = imageData;
  const n = width * height;
  const lum = new Float32Array(n);
  const buckets = new Array(12).fill(0);
  let white = 0, colorful = 0, satSum = 0;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    lum[p] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const [h, s, l] = toHsl(r, g, b);
    if (l > 0.92 && s < 0.15) white++;
    if (s > 0.28 && l > 0.12 && l < 0.9) {
      colorful++;
      satSum += s;
      buckets[Math.floor(h * 12) % 12]++;
    }
  }
  let detail = 0, pairs = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (x > 0) { detail += Math.abs(lum[p] - lum[p - 1]); pairs++; }
      if (y > 0) { detail += Math.abs(lum[p] - lum[p - width]); pairs++; }
    }
  }
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const p5 = sorted[Math.floor(n * 0.05)], p95 = sorted[Math.floor(n * 0.95)];
  return {
    range: p95 - p5,
    whiteRatio: white / n,
    colorfulRatio: colorful / n,
    avgSat: colorful ? satSum / colorful : 0,
    hueCount: colorful ? buckets.filter((c) => c / colorful > 0.06).length : 0,
    detail: pairs ? detail / pairs : 0,
  };
}

const GOOD = [
  { test: (s) => s.avgSat > 0.5 && s.colorfulRatio > 0.2, score: (s) => s.avgSat + s.colorfulRatio,
    bubbly: 'Wow, your colors are super bright and bold!', clear: 'Your colors are bright and bold.' },
  { test: (s) => s.hueCount >= 4, score: (s) => s.hueCount / 6,
    bubbly: 'You used a whole rainbow of colors. So fun!', clear: 'You used lots of different colors.' },
  { test: (s) => s.hueCount >= 1 && s.hueCount <= 2 && s.colorfulRatio > 0.12, score: () => 0.8,
    bubbly: 'Your colors go together perfectly!', clear: 'Your colors work well together.' },
  { test: (s) => s.range > 0.6, score: (s) => s.range,
    bubbly: 'Your darks and lights really pop!', clear: 'Your darks and lights stand out clearly.' },
  { test: (s) => s.detail > 0.07, score: (s) => s.detail * 8,
    bubbly: 'Look at all that amazing detail!', clear: 'You added a lot of detail.' },
  { test: (s) => s.avgSat > 0 && s.avgSat < 0.35 && s.colorfulRatio > 0.1, score: () => 0.6,
    bubbly: 'Your soft colors feel so cozy and calm!', clear: 'Your soft colors give it a calm feeling.' },
  { test: (s) => s.whiteRatio < 0.15, score: (s) => 0.7 - s.whiteRatio,
    bubbly: 'You filled the whole page. Awesome!', clear: 'You filled the whole page.' },
];
const GOOD_FALLBACK = { bubbly: 'You finished a whole piece. That takes real focus!', clear: 'You finished a whole piece. That takes focus.' };

const TRY = [
  { test: (s) => s.range < 0.45, score: (s) => 0.95 - s.range,
    bubbly: 'Try adding some dark shadows to make parts pop out!', clear: 'Try adding darker shadows so parts stand out.' },
  { test: (s) => s.whiteRatio > 0.45, score: (s) => s.whiteRatio,
    bubbly: 'Try filling in the background with a fun color!', clear: 'Try filling in more of the background.' },
  { test: (s) => s.hueCount <= 1, score: () => 0.6,
    bubbly: 'Try adding one surprise color somewhere!', clear: 'Try adding one surprise color.' },
  { test: (s) => s.detail < 0.035, score: () => 0.55,
    bubbly: 'Try adding tiny details like dots, stripes, or patterns!', clear: 'Try adding small details like patterns or texture.' },
  { test: (s) => s.hueCount >= 6, score: () => 0.5,
    bubbly: 'Try picking one color to be the star of the show!', clear: 'Try choosing one main color to lead the piece.' },
];
const TRY_FALLBACK = { bubbly: 'Try adding a shadow under something to make it look 3D!', clear: 'Try adding a shadow under something to make it look 3D.' };

function best(rules, stats, fallback, vibe) {
  const hits = rules.filter((r) => r.test(stats)).sort((a, b) => b.score(stats) - a.score(stats));
  return (hits[0] || fallback)[vibe === 'clear' ? 'clear' : 'bubbly'];
}

export function feedbackFromStats(stats, vibe = 'bubbly') {
  return { good: best(GOOD, stats, GOOD_FALLBACK, vibe), tryNext: best(TRY, stats, TRY_FALLBACK, vibe) };
}

export async function analyzeImage(blob, vibe = 'bubbly') {
  const img = await loadImage(blob);
  const size = 96;
  const ratio = img.naturalWidth / img.naturalHeight || 1;
  const canvas = document.createElement('canvas');
  canvas.width = ratio >= 1 ? size : Math.max(1, Math.round(size * ratio));
  canvas.height = ratio >= 1 ? Math.max(1, Math.round(size / ratio)) : size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.release();
  const stats = measure(ctx.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height);
  return feedbackFromStats(stats, vibe);
}
