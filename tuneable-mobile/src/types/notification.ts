export type AppNotification = {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  isRead: boolean;
  createdAt: string;
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
