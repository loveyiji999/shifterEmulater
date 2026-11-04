// v1.8.8 desktop-view steering adapter.
// The historical SHIFT LAB equations use +Z forward and +X vehicle-right.
// The Three.js chase camera looks toward world +Z with +Y up; that projection
// displays +X on the *left* side of the screen. Reverse only the player's
// steering command at the host boundary. Do not invert tire forces, ESC,
// Rapier torques or the original four-corner physics implementation.
export const VISUAL_STEER_TO_LEGACY = -1;

export function legacyDirectionalKey(driverKey) {
  if (driverKey === 'a') return 'd';
  if (driverKey === 'd') return 'a';
  return driverKey;
}

export function legacySteerFromVisualAxis(visualAxis, extraInvert = false) {
  const n = Number(visualAxis);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n)) * VISUAL_STEER_TO_LEGACY * (extraInvert ? -1 : 1);
}

// For non-physics HUD labels. The user operates a camera-facing visual car.
export function visualSteeringFromLegacy(legacySteer) {
  const n = Number(legacySteer);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n * VISUAL_STEER_TO_LEGACY));
}

export function visualDirectionLabel(visualSteer, deadzone = 0.02) {
  return visualSteer < -deadzone ? '← 左轉' : visualSteer > deadzone ? '右轉 →' : '正前方';
}
