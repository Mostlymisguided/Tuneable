const { resolveNotificationLink } = require('../utils/notificationLink');

describe('resolveNotificationLink', () => {
  test('keeps an explicit collective invitation link', () => {
    const notification = resolveNotificationLink({
      type: 'collective_invite',
      link: '/collective/night-shift',
      linkText: 'View Collective',
    });
    expect(notification.link).toBe('/collective/night-shift');
    expect(notification.linkText).toBe('View Collective');
  });

  test('builds a collective link from the related record when link was omitted', () => {
    const notification = resolveNotificationLink({
      type: 'collective_invite',
      relatedCollectiveId: { slug: 'night shift', uuid: 'uuid-1', _id: 'abc' },
    });
    expect(notification.link).toBe('/collective/night%20shift');
    expect(notification.linkText).toBe('View Collective');
  });

  test('does not treat a raw id as a collective slug', () => {
    const notification = resolveNotificationLink({
      type: 'collective_invite',
      relatedCollectiveId: '507f1f77bcf86cd799439011',
    });
    expect(notification.link).toBeUndefined();
  });

  test('prefers label, then conversation, party, and media', () => {
    expect(
      resolveNotificationLink({
        relatedLabelId: { slug: 'outer-reaches' },
        relatedMediaId: { uuid: 'tune-1' },
      }).link
    ).toBe('/label/outer-reaches');

    expect(
      resolveNotificationLink({
        relatedConversationId: { uuid: 'conv-1' },
      }).link
    ).toBe('/conversations/conv-1');

    expect(
      resolveNotificationLink({
        relatedPartyId: { uuid: 'party-1' },
      }).link
    ).toBe('/party/party-1');

    expect(
      resolveNotificationLink({
        relatedMediaId: { uuid: 'tune-9' },
      }).link
    ).toBe('/tune/tune-9');
  });
});
