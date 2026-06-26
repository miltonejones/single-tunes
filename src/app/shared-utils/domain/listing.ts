import { ISortProp } from '../models';

/**
 * Builds a `/request/...` path for a single entity (by id) or an unfiltered
 * listing (no id, e.g. the track library). A filter, if present, is always
 * appended to `/request` rather than switching the base path.
 */
export function buildAppendFilterPath(
  entityType: string,
  sort: ISortProp,
  page: number,
  id?: number | string,
): string {
  let address = `/request/${sort.field}/${sort.direction}/${page}/${entityType}`;
  if (id !== undefined) {
    address += `/${id}`;
  }
  if (sort.filter) {
    address += `/${sort.filter}`;
  }
  return address;
}

/**
 * Builds a path for a paginated grid of many entities. Unlike
 * `buildAppendFilterPath`, a filter switches the base path to `/locate`
 * instead of being appended to `/request`.
 */
export function buildSwitchedFilterPath(
  entityType: string,
  sort: ISortProp,
  page: number,
): string {
  const path = sort.filter ? '/locate' : '/request';
  let address = `/${sort.field}/${sort.direction}/${page}/${entityType}`;
  if (sort.filter) {
    address += `/${sort.filter}`;
  }
  return path + address;
}
