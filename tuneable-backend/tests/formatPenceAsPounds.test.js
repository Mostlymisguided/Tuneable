const { formatPenceAsPounds, resolveNotificationLink } = require('../utils/notificationLink');

describe('formatPenceAsPounds', () => {
  test('renders a 55p tip as £0.55', () => {
    expect(formatPenceAsPounds(55)).toBe('£0.55');
  });

  test('renders whole pounds from pence', () => {
    expect(formatPenceAsPounds(5500)).toBe('£55.00');
  });

  test('renders a missing amount as £0.00', () => {
    expect(formatPenceAsPounds(undefined)).toBe('£0.00');
  });
});

describe('stored tip notifications', () => {
  test('rewrites a 55p tip that was labelled £55.00', () => {
    const notification = resolveNotificationLink({
      type: 'bid_received',
      message: 'alex placed a £55.00 tip on "Night Drive"',
      relatedBidId: { _id: 'bid-1', amount: 55 },
    });
    expect(notification.message).toBe('alex placed a £0.55 tip on "Night Drive"');
    expect(notification.relatedBidId).toBe('bid-1');
  });

  test('leaves a tip that was already labelled in pounds', () => {
    const notification = resolveNotificationLink({
      type: 'bid_outbid',
      message: 'Someone placed a higher tip (£0.55) on "Night Drive"',
      relatedBidId: { _id: 'bid-2', amount: 55 },
    });
    expect(notification.message).toBe('Someone placed a higher tip (£0.55) on "Night Drive"');
  });

  test('leaves a genuine £55 tip', () => {
    const notification = resolveNotificationLink({
      type: 'bid_received',
      message: 'alex placed a £55.00 tip on "Night Drive"',
      relatedBidId: { _id: 'bid-3', amount: 5500 },
    });
    expect(notification.message).toBe('alex placed a £55.00 tip on "Night Drive"');
  });

  test('rewrites a £55 tip that was stored as £5500.00', () => {
    const notification = resolveNotificationLink({
      type: 'bid_received',
      message: 'alex placed a £5500.00 tip on "Night Drive"',
      relatedBidId: { _id: 'bid-4', amount: 5500 },
    });
    expect(notification.message).toBe('alex placed a £55.00 tip on "Night Drive"');
  });
});
