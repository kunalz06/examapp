/**
 * Temporal filtering for candidate phone detections. One model prediction is never
 * sufficient to raise an exam-integrity event. This code is deliberately independent
 * of the camera/model, so the decision policy can be tested without hardware.
 */
export const PHONE_SCORE_THRESHOLD = 0.55
export const PHONE_SAMPLE_INTERVAL_MS = 1_800
export const PHONE_REQUIRED_POSITIVE_FRAMES = 3
export const PHONE_POSITIVE_WINDOW_MS = 8_000
export const PHONE_CLEAR_WINDOW_MS = 5_000
export const PHONE_ALERT_COOLDOWN_MS = 60_000

export type PhoneObservationState = {
  firstPositiveAt: number | null
  lastPositiveAt: number | null
  positiveFrames: number
  peakScore: number
  absentSince: number | null
  reportedThisSighting: boolean
  lastAlertAt: number | null
}

export const initialPhoneObservation = (): PhoneObservationState => ({
  firstPositiveAt: null,
  lastPositiveAt: null,
  positiveFrames: 0,
  peakScore: 0,
  absentSince: null,
  reportedThisSighting: false,
  lastAlertAt: null,
})

export type PhoneObservation = {
  state: PhoneObservationState
  alert: boolean
  confidence: number
  positiveFrames: number
  observationMs: number
}

/** Only a confirmed sighting can produce an event. A sustained absence starts a fresh sighting. */
export function observePhoneFrame(
  previous: PhoneObservationState,
  score: number | null,
  now: number,
): PhoneObservation {
  const isPhone = score !== null && Number.isFinite(score) && score >= PHONE_SCORE_THRESHOLD
  const result = (state: PhoneObservationState, alert = false): PhoneObservation => ({
    state,
    alert,
    confidence: state.peakScore,
    positiveFrames: state.positiveFrames,
    observationMs: state.firstPositiveAt === null ? 0 : Math.max(0, now - state.firstPositiveAt),
  })

  if (!isPhone) {
    const absentSince = previous.absentSince ?? now
    const cleared = now - absentSince >= PHONE_CLEAR_WINDOW_MS
    if (cleared) {
      return result({ ...initialPhoneObservation(), lastAlertAt: previous.lastAlertAt, absentSince })
    }
    return result({ ...previous, absentSince })
  }

  const tooOld = previous.firstPositiveAt === null ||
    (previous.lastPositiveAt !== null && now - previous.lastPositiveAt > PHONE_CLEAR_WINDOW_MS) ||
    (previous.firstPositiveAt !== null && now - previous.firstPositiveAt > PHONE_POSITIVE_WINDOW_MS &&
      !previous.reportedThisSighting)

  const firstPositiveAt = tooOld ? now : previous.firstPositiveAt!
  const positiveFrames = tooOld ? 1 : previous.positiveFrames + 1
  const peakScore = Math.max(tooOld ? 0 : previous.peakScore, score!)
  const enoughEvidence = positiveFrames >= PHONE_REQUIRED_POSITIVE_FRAMES &&
    now - firstPositiveAt <= PHONE_POSITIVE_WINDOW_MS
  const cooldownElapsed = previous.lastAlertAt === null || now - previous.lastAlertAt >= PHONE_ALERT_COOLDOWN_MS
  const alert = enoughEvidence && cooldownElapsed && !previous.reportedThisSighting

  return result({
    firstPositiveAt,
    lastPositiveAt: now,
    positiveFrames,
    peakScore,
    absentSince: null,
    reportedThisSighting: alert || (!tooOld && previous.reportedThisSighting),
    lastAlertAt: alert ? now : previous.lastAlertAt,
  }, alert)
}
