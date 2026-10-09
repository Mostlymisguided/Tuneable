/**
 * Fill a notification's link from related records when the creator omitted one.
 * Mutates and returns the same plain object.
 */
function entityToken(value, keys) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    if (value[key]) return String(value[key]);
  }
  return null;
}

function defaultLinkText(link) {
  if (link.startsWith('/collective/')) return 'View Collective';
  if (link.startsWith('/label/')) return 'View Label';
  if (link.startsWith('/party')) return 'View Party';
  if (link.startsWith('/conversations')) return 'View conversation';
  if (link.startsWith('/tune/') || link.startsWith('/podcast')) return 'View Media';
  if (link.startsWith('/book/')) return 'View Book';
  if (link.startsWith('/user/')) return 'View Profile';
  if (link.startsWith('/wallet')) return 'View Wallet';
  if (link.startsWith('/artist-escrow')) return 'View Escrow';
  if (link.startsWith('/creator')) return 'Open';
  return 'Open';
}

function resolveNotificationLink(notification) {
  if (!notification || typeof notification !== 'object') return notification;

  if (!notification.link) {
    const collective = entityToken(notification.relatedCollectiveId, ['slug', 'uuid']);
    const label = entityToken(notification.relatedLabelId, ['slug', 'uuid']);
    const conversation = entityToken(notification.relatedConversationId, ['uuid', '_id']);
    const party = entityToken(notification.relatedPartyId, ['uuid', '_id']);
    const media = entityToken(notification.relatedMediaId, ['uuid', '_id']);

    if (collective) notification.link = `/collective/${encodeURIComponent(collective)}`;
    else if (label) notification.link = `/label/${encodeURIComponent(label)}`;
    else if (conversation) notification.link = `/conversations/${encodeURIComponent(conversation)}`;
    else if (party) notification.link = `/party/${encodeURIComponent(party)}`;
    else if (media) notification.link = `/tune/${encodeURIComponent(media)}`;
  }

  if (notification.link && !notification.linkText) {
    notification.linkText = defaultLinkText(notification.link);
  }

  return notification;
}

module.exports = {
  resolveNotificationLink,
  defaultLinkText,
};
