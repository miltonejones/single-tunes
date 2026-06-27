import { Enclosure, ParsedEpisode } from '../podcast-models';

interface RSSElement {
  name: string;
  elements?: RSSElement[];
  attributes?: { [key: string]: string };
  type?: string;
  text?: string;
  cdata?: string;
}

interface RSSData {
  elements?: RSSElement[];
}

/** Parses the RSS-to-JSON lambda's `xml-js`-shaped output into a flat list of episodes. */
export function parseRssFeed(data: unknown): ParsedEpisode[] {
  const channel = findChannel(toRssData(data)?.elements);
  if (!channel) {
    return [];
  }

  const items = extractItems(channel.elements || []);
  return items
    .map((item) => parseItem(item))
    .filter((episode): episode is ParsedEpisode => episode !== null);
}

/** Extracts the podcast/channel-level description from the same RSS-to-JSON payload. */
export function getChannelDescription(data: unknown): string {
  const channel = findChannel(toRssData(data)?.elements);
  if (!channel) {
    return '';
  }
  return cleanDescription(getElementText(channel, 'description'));
}

function toRssData(data: unknown): RSSData | null {
  if (!data) {
    return null;
  }

  if (typeof data === 'object' && (data as RSSData).elements && Array.isArray((data as RSSData).elements)) {
    return data as RSSData;
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed.elements && Array.isArray(parsed.elements) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function findChannel(elements: RSSElement[] | undefined): RSSElement | null {
  if (!elements) return null;

  for (const element of elements) {
    if (element.name === 'rss' && element.elements) {
      const channel = element.elements.find((child) => child.name === 'channel');
      if (channel) return channel;
    }
    if (element.name === 'channel') {
      return element;
    }
  }
  return null;
}

function extractItems(elements: RSSElement[]): RSSElement[] {
  const items: RSSElement[] = [];

  const extractFromElements = (els: RSSElement[]) => {
    for (const element of els) {
      if (element.name === 'item') {
        items.push(element);
      }
      if (element.elements) {
        extractFromElements(element.elements);
      }
    }
  };

  extractFromElements(elements);
  return items;
}

function parseItem(item: RSSElement): ParsedEpisode | null {
  const title = getElementText(item, 'title');
  if (!title) {
    return null;
  }

  return {
    title,
    description: cleanDescription(getElementText(item, 'description')),
    pubDate: getElementText(item, 'pubDate'),
    link: getElementText(item, 'link'),
    guid: getElementText(item, 'guid') || `episode-${Date.now()}-${Math.random()}`,
    duration: getElementText(item, 'itunes:duration'),
    author: getElementText(item, 'author') || getElementText(item, 'itunes:author'),
    enclosure: extractEnclosure(item),
  };
}

function getElementText(parentElement: RSSElement, elementName: string): string {
  if (!parentElement.elements) return '';

  for (const element of parentElement.elements) {
    if (element.name === elementName) {
      const content = element.elements?.[0];
      if (content?.type === 'text') return content.text || '';
      if (content?.type === 'cdata') return content.cdata || '';
      return '';
    }
  }
  return '';
}

function extractEnclosure(item: RSSElement): Enclosure | null {
  if (!item.elements) return null;

  for (const element of item.elements) {
    if (element.name === 'enclosure' && element.attributes) {
      return {
        url: element.attributes['url'] || '',
        type: element.attributes['type'] || 'audio/mpeg',
        length: element.attributes['length'] || '0',
      };
    }
  }
  return null;
}

function cleanDescription(description: string): string {
  if (!description) return 'No description available';

  let clean = description
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length > 200) {
    clean = clean.substring(0, 200) + '...';
  }

  return clean || 'No description available';
}
