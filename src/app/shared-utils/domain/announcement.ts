import { AnnounceFetchProps } from '../models';

const MIN_TRACK_DURATION_MS = 120000;

/** A track shorter than 2 minutes isn't worth interrupting with a spoken announcement. */
export function shouldAnnounce(trackDurationMs: number): boolean {
  return trackDurationMs >= MIN_TRACK_DURATION_MS;
}

export type AnnouncerFrequency = 'always' | 'often' | 'sometimes' | 'seldom' | 'never';

const FREQUENCY_PROBABILITY: Record<AnnouncerFrequency, number> = {
  always: 1,
  often: 0.75,
  sometimes: 0.5,
  seldom: 0.25,
  never: 0,
};

/** Randomly decides whether to announce this track based on the user's chosen frequency. */
export function shouldAnnounceForFrequency(frequency: AnnouncerFrequency): boolean {
  return Math.random() < FREQUENCY_PROBABILITY[frequency];
}

/** Strips dots so abbreviations (e.g. "Mr.") don't make speech synthesis stumble. */
export function dotless(str: string | null | undefined): string {
  return str?.replace(/\./g, '') || '';
}

export function buildAnnounceProps(
  artist: string | null | undefined,
  title: string | null | undefined,
  chatName: string,
  chatZip: string,
): AnnounceFetchProps {
  return {
    artist: dotless(artist || ''),
    title: dotless(title || ''),
    name: chatName,
    location: chatZip,
  };
}
