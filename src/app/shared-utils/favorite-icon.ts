/** Returns the FontAwesome markup for a track's favorite-toggle icon. */
export function faveIcon(isFave?: boolean): string {
  return isFave
    ? `<i class="fa-solid fa-circle-check"></i>`
    : `<i class="fa-regular fa-circle-check"></i>`;
}
