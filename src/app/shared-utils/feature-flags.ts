import { signal } from '@angular/core';

/**
 * Feature flags for toggling in-progress features on/off without deploying code changes.
 *
 * Set a flag to `true` to enable the feature in production.
 */
export const FEATURE_FLAGS = {
  /** Track Edit Properties modal — direct form-based editing of track metadata */
  trackEditModal: signal(false),
  /** Artist Bio Panel — peek bar with artist image, bio, and info button in the audio player */
  artistBioPanel: signal(false),
};
