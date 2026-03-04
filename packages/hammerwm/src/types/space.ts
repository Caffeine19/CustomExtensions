export interface Space {
  id: string;
  name: string;
  screenId: string;
  screenName: string;
  isCurrent: boolean;
}

export interface Window {
  id: string;
  title: string;
  application: string;
  isMinimized: boolean;
  isFullscreen: boolean;
  spaceId?: string;
}
