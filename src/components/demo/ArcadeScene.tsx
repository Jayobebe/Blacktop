import { Gamepad2 } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { A, aa, INK, MUTED, PANEL, LINE, ROAD, RED, GREEN, SKY, Frame, Base, Defs, Vignette, Chip, T, useIds, useSceneTime, loopT, easeInOut, type SceneCue } from '@/components/scene/kit';

const CUES: SceneCue[] = [[1.2, 'impact'], [4.2, 'beep'], [7.2, 'impact'], [10.2, 'success']];

/** Four lightweight game vignettes; no game engines or live data in the tour. */
export function ArcadeScene() {
  const id = useIds();
  const t = loopT(useSceneTime(0), 12);
  const active = Math.floor(t / 3);
  const hit = Math.pow(Math.max(0, Math.sin(t * 2.6)), 8);
  const clash = Math.sin(t * 1.5) ** 8;
  const lane = easeInOut((t % 4) / 2) * 32;
  const labels = ['Hit Heavy', 'Petrol Head', 'Derez Legacy', 'Card Wars'];
  return (
    <Frame sound={{ t, cues: CUES }}>
      <Defs id={id} /><Base id={id} />
      <Chip x={8} y={7} label={tr('Arcade')} I={Gamepad2} />
      {labels.map((label, i) => {
        const x = 8 + (i % 2) * 156;
        const y = 35 + Math.floor(i / 2) * 80;
        return <g key={label} transform={`translate(${x} ${y})`}>
          <rect width={148} height={74} rx={5} fill={PANEL} stroke={active === i ? A : LINE} />
          <T x={8} y={13} size={8} weight={800}>{tr(label)}</T>
          {i === 0 && <>
            <path d="M20 61 A27 27 0 0 1 74 61" fill="none" stroke={LINE} strokeWidth={5} />
            <path d="M20 61 A27 27 0 0 1 74 61" fill="none" stroke={A} strokeWidth={3} strokeDasharray={`${38 + hit * 47} 90`} />
            <path d={`M47 59 L${28 + hit * 35} ${44 - hit * 12}`} stroke={INK} strokeWidth={2} />
            <circle cx={47} cy={59} r={3} fill={A} />
            <T x={111} y={43} size={17} anchor="middle" mono weight={900} color={A}>{(2.1 + hit * 6.3).toFixed(1)}</T>
            <T x={111} y={56} size={7} anchor="middle" color={MUTED}>{tr('G-force')}</T>
          </>}
          {i === 1 && <>
            <rect x={37} y={20} width={75} height={49} fill={ROAD} />
            {[62, 87].map(x => <path key={x} d={`M${x} 20V69`} stroke={MUTED} strokeDasharray="7 6" strokeDashoffset={-t * 20} />)}
            <rect x={43 + lane} y={46} width={12} height={20} rx={3} fill={A} stroke={INK} />
            <rect x={92} y={21 + (t * 17) % 23} width={12} height={18} rx={3} fill={RED} />
            <rect x={68} y={23} width={11} height={17} rx={3} fill={INK} />
            <path d="M10 30H25V58H10Z M13 26H22V30 M25 35L30 39V53" fill="none" stroke={GREEN} strokeWidth={1.5} />
          </>}
          {i === 2 && <>
            <path d="M9 21H138V66H9Z" fill={aa(0.04)} stroke={LINE} strokeDasharray="3 3" />
            <path d="M18 57H47V29H90V47H124" fill="none" stroke={A} strokeWidth={2} pathLength={100} strokeDasharray={`${35 + (t % 3) * 21} 100`} />
            <path d="M130 27H105V58H66V42H26" fill="none" stroke={SKY} strokeWidth={2} pathLength={100} strokeDasharray={`${28 + (t % 3) * 24} 100`} />
          </>}
          {i === 3 && <>
            {[0, 1].map(n => <g key={n} transform={`translate(${32 + n * 49 + (n ? -1 : 1) * clash * 12} 23) rotate(${n ? 6 : -6} 14 17)`}>
              <rect width={28} height={35} rx={2} fill={n ? RED : MUTED} stroke={INK} strokeWidth={0.7} />
              <rect x={3} y={6} width={22} height={14} rx={1} fill={ROAD} />
              <path d="M5 15H21L18 10H10Z" fill={INK} />
              <path d="M3 25H12M16 25H25M3 30H12M16 30H25" stroke={INK} strokeWidth={2} />
              <rect y={39} width={28} height={3} fill={LINE} />
              <rect y={39} width={28 - (n ? 14 : 5) * clash} height={3} fill={n ? RED : GREEN} />
            </g>)}
            <path d="M72 32L76 38L71 43L77 49" fill="none" stroke={A} strokeWidth={2} />
          </>}
        </g>;
      })}
      <Vignette id={id} />
    </Frame>
  );
}