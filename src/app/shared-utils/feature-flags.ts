/**
 * Feature flags for toggling in-progress features on/off without deploying code changes.
 *
 * Set a flag to `true` to enable the feature in production.
 */
export const FEATURE_FLAGS = {
  /** Track Edit Properties modal — direct form-based editing of track metadata */
  trackEditModal: false,
  /** Show artist name in the audio player when a track is playing */
  artistInfoOnTrackPlay: false,
};
