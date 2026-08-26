interface HwatuCardArtProps {
  cardId: string;
  name: string;
}

const monthById: Record<string, number> = {
  pine: 1,
  plum: 2,
  cherry: 3,
  wisteria: 4,
  iris: 5,
  peony: 6,
  clover: 7,
  moon: 8,
  chrysanthemum: 9,
  maple: 10,
  paulownia: 11,
  willow: 12,
};

function FivePetal({
  x,
  y,
  color = "#ef4444",
  scale = 1,
}: {
  x: number;
  y: number;
  color?: string;
  scale?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill={color}
      stroke="#7f1d1d"
      strokeWidth="1"
    >
      <circle cx="0" cy="-6" r="5" />
      <circle cx="6" cy="-1" r="5" />
      <circle cx="4" cy="6" r="5" />
      <circle cx="-4" cy="6" r="5" />
      <circle cx="-6" cy="-1" r="5" />
      <circle cx="0" cy="0" r="2.5" fill="#facc15" stroke="none" />
    </g>
  );
}

function Leaf({
  x,
  y,
  rotate = 0,
  color = "#15803d",
}: {
  x: number;
  y: number;
  rotate?: number;
  color?: string;
}) {
  return (
    <ellipse
      cx={x}
      cy={y}
      rx="5"
      ry="14"
      fill={color}
      stroke="#14532d"
      strokeWidth="1"
      transform={`rotate(${rotate} ${x} ${y})`}
    />
  );
}

function Motif({ id }: { id: string }) {
  switch (id) {
    case "pine":
      return (
        <>
          <circle cx="71" cy="31" r="16" fill="#ef4444" />
          <path
            d="M18 133C30 102 32 70 35 24M35 45L17 61M34 55L55 70M34 78L13 94M34 91L55 106"
            stroke="#3f3f46"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M12 48l24-17 22 18M8 72l28-18 26 20M8 101l27-18 25 18"
            stroke="#166534"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M58 91c10-15 21-16 29-8-9 1-14 5-16 12 7-2 13 1 17 6-12 3-22 0-30-10z"
            fill="#f8fafc"
            stroke="#111827"
            strokeWidth="2"
          />
          <path d="M69 95l-5 19m11-17 5 16" stroke="#111827" strokeWidth="2" />
        </>
      );
    case "plum":
      return (
        <>
          <path
            d="M18 136C30 104 40 70 55 25M36 83L18 62M44 64L69 48M31 102L66 95"
            stroke="#4b2e1f"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <FivePetal x={18} y={59} />
          <FivePetal x={70} y={46} scale={0.9} />
          <FivePetal x={66} y={94} />
          <FivePetal x={55} y={27} scale={0.8} />
          <path
            d="M54 76c10-12 21-11 29-4-8 1-13 5-16 10 7-1 13 1 17 6-12 4-23 0-30-12z"
            fill="#fde047"
            stroke="#111827"
            strokeWidth="2"
          />
          <circle cx="77" cy="74" r="2" />
        </>
      );
    case "cherry":
      return (
        <>
          <path
            d="M8 129C29 112 29 78 47 45M31 88L13 68M40 66L70 50M27 107L65 101"
            stroke="#4b2e1f"
            strokeWidth="6"
            fill="none"
          />
          <FivePetal x={13} y={66} color="#fb7185" />
          <FivePetal x={72} y={49} color="#fda4af" />
          <FivePetal x={64} y={101} color="#fb7185" />
          <FivePetal x={47} y={44} color="#fda4af" />
          <path
            d="M57 12h34v57l-17-8-17 8z"
            fill="#dc2626"
            stroke="#7f1d1d"
            strokeWidth="2"
          />
          <path
            d="M61 20h26M61 29h26M61 38h26"
            stroke="#fbbf24"
            strokeWidth="3"
          />
        </>
      );
    case "wisteria":
      return (
        <>
          <path
            d="M14 31c18 7 39 7 72-3M34 32c-1 22-4 43-14 67M56 32c-2 27-5 48-13 79M76 30c-1 17-4 31-10 48"
            stroke="#365314"
            strokeWidth="6"
            fill="none"
          />
          <path
            d="M22 51c12 3 15 12 3 22-12-4-14-13-3-22zm22 11c13 4 15 14 2 24-11-5-13-14-2-24zm20-15c12 4 14 13 2 22-11-4-13-13-2-22zM38 89c12 3 15 13 3 23-12-4-14-14-3-23z"
            fill="#7c3aed"
            stroke="#4c1d95"
            strokeWidth="1"
          />
          <path
            d="M63 92c8-12 19-13 28-7-8 2-13 6-16 12 6-1 11 1 15 5-10 4-20 1-27-10z"
            fill="#111827"
          />
        </>
      );
    case "iris":
      return (
        <>
          <path
            d="M18 136l22-98M34 137l30-105M55 138l26-87"
            stroke="#166534"
            strokeWidth="5"
          />
          <path
            d="M40 42c-17 2-22 12-8 22-3-13 4-17 8-22zm2 2c16 4 20 14 6 22 4-12-2-18-6-22zM66 34c-16 1-22 10-9 21-2-12 5-17 9-21zm2 2c15 4 19 13 6 21 3-12-2-17-6-21z"
            fill="#4f46e5"
            stroke="#312e81"
          />
          <path
            d="M6 107h87l-8 16H14z"
            fill="#d97706"
            stroke="#78350f"
            strokeWidth="2"
          />
          <path
            d="M18 107c17-14 45-15 65 0"
            fill="none"
            stroke="#92400e"
            strokeWidth="5"
          />
        </>
      );
    case "peony":
      return (
        <>
          <path
            d="M50 139V58M49 89L21 76M50 99L78 82"
            stroke="#166534"
            strokeWidth="6"
          />
          <Leaf x={24} y={77} rotate={-62} />
          <Leaf x={76} y={82} rotate={58} />
          <FivePetal x={50} y={51} color="#ef4444" scale={1.7} />
          <FivePetal x={28} y={70} color="#fb7185" />
          <FivePetal x={73} y={71} color="#f43f5e" />
          <path
            d="M19 36c9-12 18-7 21 3-8-4-14-1-18 6m58-9c-8-11-18-6-20 4 8-5 14-2 18 5"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3"
          />
          <circle cx="20" cy="34" r="3" fill="#111827" />
          <circle cx="80" cy="34" r="3" fill="#111827" />
        </>
      );
    case "clover":
      return (
        <>
          <path
            d="M9 139C28 116 31 89 31 49M31 83L10 71M31 69L52 55M55 140C60 111 66 85 77 56M68 85L49 72M70 77L90 69"
            stroke="#365314"
            strokeWidth="6"
            fill="none"
          />
          <path
            d="M12 68l20-9 18 10-19 8zM49 68l21-8 20 10-22 8zM20 95l17-9 17 9-18 9zM54 100l18-10 18 9-20 10z"
            fill="#a855f7"
            stroke="#581c87"
          />
          <path
            d="M52 111c11-13 25-12 37-4-8 5-12 12-11 21-12-2-21-8-26-17z"
            fill="#92400e"
            stroke="#451a03"
            strokeWidth="2"
          />
          <path d="M79 115l10 9" stroke="#451a03" strokeWidth="3" />
        </>
      );
    case "moon":
      return (
        <>
          <circle
            cx="68"
            cy="38"
            r="24"
            fill="#facc15"
            stroke="#eab308"
            strokeWidth="2"
          />
          <path
            d="M4 139C19 104 23 73 26 38M26 82L8 64M27 71L48 52M45 140C53 107 60 82 72 61M63 88L88 72"
            stroke="#9a3412"
            strokeWidth="5"
            fill="none"
          />
          <path
            d="M10 94l18-14 19 15-20 14zM48 107l18-16 22 16-23 14z"
            fill="#d6d3d1"
            stroke="#57534e"
          />
          <path
            d="M14 30c12-8 22-7 31 1-12-2-21 0-31-1zm22 11c10-7 19-6 27 1-10-2-18 0-27-1z"
            fill="#111827"
          />
        </>
      );
    case "chrysanthemum":
      return (
        <>
          <path
            d="M50 140V72M50 99L22 87M50 108L79 91"
            stroke="#166534"
            strokeWidth="6"
          />
          <Leaf x={24} y={88} rotate={-64} />
          <Leaf x={77} y={92} rotate={64} />
          <FivePetal x={25} y={67} color="#facc15" scale={1.2} />
          <FivePetal x={51} y={55} color="#fde047" scale={1.4} />
          <FivePetal x={77} y={69} color="#facc15" scale={1.2} />
          <path
            d="M31 108h38l-5 24H36z"
            fill="#f8fafc"
            stroke="#1f2937"
            strokeWidth="2"
          />
          <path d="M37 116h26" stroke="#dc2626" strokeWidth="3" />
        </>
      );
    case "maple":
      return (
        <>
          <path
            d="M23 140c7-43 21-76 43-112M42 91L17 71M51 70L82 57M36 111L71 105"
            stroke="#4b2e1f"
            strokeWidth="7"
            fill="none"
          />
          <path
            d="M17 63l5 9 11-4-5 10 8 7-12-1-4 11-3-11-12 1 8-8-5-10zM78 48l4 8 10-3-5 9 7 6-10-1-4 10-3-10-10 1 7-7-4-9zM67 96l5 9 11-4-5 10 8 7-12-1-4 11-3-11-12 1 8-8-5-10z"
            fill="#dc2626"
            stroke="#991b1b"
          />
          <path
            d="M57 91c9-15 21-17 31-9-8 3-13 8-15 16l-9 15-7-22z"
            fill="#a16207"
            stroke="#422006"
            strokeWidth="2"
          />
          <path d="M79 86l10-7" stroke="#422006" strokeWidth="2" />
        </>
      );
    case "paulownia":
      return (
        <>
          <path
            d="M12 139h76M24 137V71M50 137V47M76 137V71"
            stroke="#3f3f46"
            strokeWidth="5"
          />
          <path
            d="M12 74c10-18 23-17 30 0-11-5-20-5-30 0zm29-23c9-18 21-18 30 0-11-5-20-5-30 0zm18 23c10-18 23-18 30 0-11-5-20-5-30 0z"
            fill="#7c3aed"
            stroke="#4c1d95"
          />
          <path
            d="M25 94l12 9-12 9-12-9zm50 0 12 9-12 9-12-9z"
            fill="#facc15"
            stroke="#92400e"
          />
          <path
            d="M36 86c8-13 20-18 31-11l10 10-13 1-9 12-7-10-12-2z"
            fill="#dc2626"
            stroke="#7f1d1d"
            strokeWidth="2"
          />
          <circle cx="63" cy="79" r="2" fill="#111827" />
        </>
      );
    case "willow":
      return (
        <>
          <path
            d="M18 18c14 24 15 61 8 118M43 16c13 25 11 68 4 121M72 20c10 24 7 65-2 115"
            stroke="#4d7c0f"
            strokeWidth="5"
            fill="none"
          />
          <path
            d="M19 39l-13 16m20-2L11 72m34-34L31 56m16 8L31 84m43-43L59 59m14 12L58 92"
            stroke="#65a30d"
            strokeWidth="4"
          />
          <path
            d="M54 84c8-11 18-12 27-5-8 2-13 6-15 12 6-1 11 1 15 5-10 3-19 0-27-12z"
            fill="#111827"
          />
          <path
            d="M13 27l11-12M39 30l10-15M65 31l10-14"
            stroke="#38bdf8"
            strokeWidth="2"
          />
          <circle cx="84" cy="29" r="11" fill="#ef4444" />
        </>
      );
    default:
      return (
        <>
          <circle cx="50" cy="64" r="26" fill="#ef4444" />
          <path
            d="M18 128c21-24 43-28 65-5"
            stroke="#166534"
            strokeWidth="8"
            fill="none"
          />
        </>
      );
  }
}

export default function HwatuCardArt({ cardId, name }: HwatuCardArtProps) {
  const id = cardId.replace(/^hwatu:/, "");
  const month = monthById[id] ?? 0;
  return (
    <svg
      viewBox="0 0 100 150"
      role="img"
      aria-label={`${month}월 ${name} 화투 카드`}
      className="hwatu-svg"
    >
      <rect
        x="2"
        y="2"
        width="96"
        height="146"
        rx="8"
        fill="#fffdf4"
        stroke="#111827"
        strokeWidth="3"
      />
      <Motif id={id} />
      <rect
        x="7"
        y="7"
        width="22"
        height="19"
        rx="5"
        fill="#111827"
        opacity=".9"
      />
      <text
        x="18"
        y="21"
        textAnchor="middle"
        fill="#fff"
        fontSize="12"
        fontWeight="900"
      >
        {month}월
      </text>
    </svg>
  );
}
