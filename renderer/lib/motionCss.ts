import type { MotionParams } from "./spriteData";

/**
 * Generates the motion-driven half of CatSvg's CSS from loaded motion
 * params, instead of hand-keeping keyframe numbers in sync with the `MOTION`
 * object (the double transcription CatSvg.tsx used to flag at :36-40).
 * Keyframe shapes mirror sprite-lab's lib/export/css.ts SPECS — same
 * per-motion param -> keyframe mapping, gate-verified there — but the
 * selectors stay Toasty's own (state-based / interaction-based classes on
 * `.toasty-cat`, not a single `.motion-<name>` class).
 *
 * `breathe-slow` (state-thinking/state-sleep) and the dragging pose aren't
 * separate MOTION_DEFAULTS entries — they're Toasty-specific derivations
 * (a slowed breathe amplitude, and scrunch's rest pose held statically
 * instead of animated) kept as local constants, not part of the mirrored
 * per-motion mapping.
 */
export function buildMotionCss(motions: Record<string, MotionParams>): string {
  const breathe = motions.breathe ?? { periodMs: 1600, scaleY: 1.018 };
  const bounce = motions.bounce ?? { periodMs: 600, px: 10 };
  const jump = motions.jump ?? { heightPx: 40, periodMs: 470, repeats: 2, squashLand: 0.91 };
  const squash = motions.squash ?? { scaleX: 1.06, scaleY: 0.92, ms: 180 };
  const purr = motions.purr ?? { amp: 2.8, periodMs: 320 };
  const scrunch = motions.scrunch ?? { scale: 0.94, rotateDeg: -3 };
  const settle = motions.settle ?? { ms: 260, overshoot: 1.03 };

  const slowScaleY = 1 + ((breathe.scaleY ?? 1.018) - 1) * 0.5;

  return `
.toasty-cat .critter { animation: t-breathe ${breathe.periodMs ?? 1600}ms ease-in-out infinite; }
.toasty-cat.state-thinking .critter { animation: t-breathe-slow 6s ease-in-out infinite; }
.toasty-cat.state-sleep .critter { animation: t-breathe-slow 7s ease-in-out infinite; }
.toasty-cat.state-happy .critter { animation: t-bounce ${bounce.periodMs ?? 600}ms ease-in-out infinite; }
.toasty-cat.state-alert .critter { animation: t-jump ${jump.periodMs ?? 470}ms ease-in-out ${Math.max(1, Math.round(jump.repeats ?? 2))}; }

.toasty-cat.int-tapped .critter { animation: t-squash ${squash.ms ?? 180}ms ease-out 1; }
.toasty-cat.int-petting .critter { animation: t-purr ${purr.periodMs ?? 320}ms ease-in-out infinite; }
.toasty-cat.int-dragging .critter { animation: none; transform: scale(${scrunch.scale ?? 0.94}) rotate(${scrunch.rotateDeg ?? -3}deg); }
.toasty-cat.int-settling .critter { animation: t-settle ${settle.ms ?? 260}ms ease-out 1; }

@keyframes t-breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(${breathe.scaleY ?? 1.018}); } }
@keyframes t-breathe-slow { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(${slowScaleY}); } }
@keyframes t-bounce { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-${bounce.px ?? 10}px); } }
@keyframes t-jump {
  0%, 100% { transform: translateY(0px) scaleY(1); }
  35% { transform: translateY(-${jump.heightPx ?? 40}px) scaleY(1.02); }
  70% { transform: translateY(0px) scaleY(${jump.squashLand ?? 0.91}); }
  85% { transform: translateY(0px) scaleY(1.01); }
}
@keyframes t-squash {
  0% { transform: scale(1,1); }
  40% { transform: scale(${squash.scaleX ?? 1.06}, ${squash.scaleY ?? 0.92}); }
  100% { transform: scale(1,1); }
}
@keyframes t-purr { 0%, 100% { transform: translateX(0px); } 50% { transform: translateX(${purr.amp ?? 2.8}px); } }
@keyframes t-settle {
  0% { transform: scale(${scrunch.scale ?? 0.94}) rotate(${scrunch.rotateDeg ?? -3}deg); }
  55% { transform: scale(${settle.overshoot ?? 1.03}) rotate(0deg); }
  100% { transform: scale(1) rotate(0deg); }
}
`;
}
