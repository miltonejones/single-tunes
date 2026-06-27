import { IPodcast, ITrack, ParsedEpisode } from '../podcast-models';

/** Builds a playable track from a parsed RSS episode + its source podcast. */
export function toTrack(episode: ParsedEpisode, podcast: IPodcast): ITrack | null {
  if (!episode.enclosure?.url) {
    return null;
  }

  return {
    title: episode.title,
    audioUrl: episode.enclosure.url,
    guid: episode.guid,
    description: episode.description,
    duration: episode.duration,
    episode,
    podcastFeedUrl: podcast.feedUrl || '',
  };
}
