export type PageLayoutWidth = 'default' | 'wide' | 'full';

export const PAGE_LAYOUT_WIDTH_CLASSES: Record<PageLayoutWidth, string> = {
  default: 'max-w-md md:max-w-3xl',
  wide: 'max-w-5xl',
  full: 'w-full',
};
