/**
 * Original illustrated landscape drawn in SVG: sky, painterly clouds, warm horizon
 * light, layered hills, a meadow with grass blades and a fine grain for a painted feel.
 * To use a photo/illustration instead, pass `image="/hero.jpg"` (put the file in /public).
 */

// Small deterministic random generator so server and browser render identical grass.
function seeded(seed) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function grassBlades(count, seed) {
  const rand = seeded(seed);
  const blades = [];
  for (let i = 0; i < count; i++) {
    const x = rand() * 1480 - 20;
    const depth = rand(); // 0 = far (top of meadow), 1 = near (bottom)
    const base = 745 + depth * 165;
    const h = 5 + depth * 16 + rand() * 6; // nearer blades are taller
    const lean = (rand() - 0.5) * (6 + depth * 10);
    blades.push({ d: `M${x.toFixed(1)} ${base.toFixed(1)} q${(lean / 2).toFixed(1)} ${(-h / 2).toFixed(1)} ${lean.toFixed(1)} ${(-h).toFixed(1)}`, o: (0.12 + depth * 0.3 + rand() * 0.12).toFixed(2), w: (0.6 + depth * 0.9).toFixed(2) });
  }
  return blades;
}

const BLADES = grassBlades(520, 11);

export function ScenicBackground({ image, className = "" }) {
  if (image) {
    return (
      <div aria-hidden="true" className={`absolute inset-0 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" className={`absolute inset-0 h-full w-full ${className}`}>
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b7cfe9" />
          <stop offset="0.38" stopColor="#d4e3f2" />
          <stop offset="0.66" stopColor="#ece9e2" />
          <stop offset="1" stopColor="#f3eee5" />
        </linearGradient>
        <radialGradient id="sc-sun" cx="0.7" cy="0.66" r="0.42">
          <stop offset="0" stopColor="#fff6e2" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff6e2" stopOpacity="0" />
        </radialGradient>
        <filter id="sc-cloud" x="-30%" y="-60%" width="160%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="4" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="70" />
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="sc-edge" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="10" />
        </filter>
        <filter id="sc-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.33  0 0 0 0 0.3  0 0 0 0.09 0" />
        </filter>
        <linearGradient id="sc-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8c9d2" />
          <stop offset="1" stopColor="#cfd9d8" />
        </linearGradient>
        <linearGradient id="sc-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6c0a2" />
          <stop offset="1" stopColor="#bccdb2" />
        </linearGradient>
        <linearGradient id="sc-meadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fb37c" />
          <stop offset="0.6" stopColor="#7aa267" />
          <stop offset="1" stopColor="#6c955b" />
        </linearGradient>
      </defs>

      <rect width="1440" height="900" fill="url(#sc-sky)" />
      <rect width="1440" height="900" fill="url(#sc-sun)" />

      <g filter="url(#sc-cloud)" fill="#ffffff">
        <ellipse cx="230" cy="190" rx="230" ry="46" opacity="0.75" />
        <ellipse cx="420" cy="150" rx="150" ry="34" opacity="0.6" />
        <ellipse cx="1080" cy="120" rx="260" ry="50" opacity="0.7" />
        <ellipse cx="1300" cy="230" rx="170" ry="36" opacity="0.55" />
        <ellipse cx="760" cy="260" rx="220" ry="30" opacity="0.45" />
      </g>

      <g filter="url(#sc-edge)">
        <path d="M-20 610 C 180 560 320 585 470 548 C 640 506 760 560 930 535 C 1100 510 1250 552 1460 520 L1460 960 L-20 960 Z" fill="url(#sc-far)" opacity="0.85" />
        <path d="M-20 680 C 220 630 380 668 560 640 C 760 610 900 668 1090 646 C 1240 628 1350 650 1460 640 L1460 960 L-20 960 Z" fill="url(#sc-mid)" />
        <path d="M-20 760 C 260 715 470 745 700 728 C 940 710 1150 742 1460 718 L1460 960 L-20 960 Z" fill="url(#sc-meadow)" />
      </g>

      <g stroke="#5d8a4c" strokeLinecap="round" fill="none">
        {BLADES.map((b, i) => (
          <path key={i} d={b.d} strokeWidth={b.w} opacity={b.o} />
        ))}
      </g>

      <rect width="1440" height="900" filter="url(#sc-grain)" />
    </svg>
  );
}
