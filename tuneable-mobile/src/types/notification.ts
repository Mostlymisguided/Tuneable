export type NotificationRef =
  | string
  | {
      _id?: string;
      slug?: string;
      uuid?: string;
      name?: string;
    }
  | null;

export type AppNotification = {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  isRead: boolean;
  createdAt: string;
  inviteType?: 'admin' | 'artist' | 'member' | null;
  relatedLabelId?: NotificationRef;
  relatedCollectiveId?: NotificationRef;
};

export type NotificationListResponse = {
  notifications: AppNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  unreadCount: number;
};
