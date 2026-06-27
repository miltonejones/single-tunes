import { PaginationResult, ParsedEpisode } from '../podcast-models';

export function formatDuration(duration: number): string {
  if (!duration || isNaN(duration)) return '0:00';
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sortTrackList(
  trackList: ParsedEpisode[],
  sortField: string = 'title',
  ascOffset: 1 | -1 = 1,
): ParsedEpisode[] {
  return [...trackList].sort((a, b) => {
    let aProp: any = a[sortField as keyof ParsedEpisode];
    let bProp: any = b[sortField as keyof ParsedEpisode];
    if (sortField === 'pubDate') {
      aProp = new Date(aProp as string).getTime();
      bProp = new Date(bProp as string).getTime();
    }
    return aProp > bProp ? ascOffset * 1 : ascOffset * -1;
  });
}

export function usePagination(
  collection: ParsedEpisode[] = [],
  options: { page?: number; pageSize: number },
): PaginationResult {
  const { page = 1, pageSize } = options;
  const pageCount = Math.ceil(collection.length / pageSize);
  const startNum = (page - 1) * pageSize;
  const visible = collection.slice(startNum, startNum + pageSize);

  return { startNum, pageCount, visible };
}
