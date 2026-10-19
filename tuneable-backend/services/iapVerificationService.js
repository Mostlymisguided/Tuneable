const axios = require('axios');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { getProductById } = require('./iapProducts');
const { storePriceFromApplePayload, priceFromGoogleOrder } = require('./iapPriceGuard');

const APPLE_PRODUCTION_VERIFY = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_VERIFY = 'https://sandbox.itunes.apple.com/verifyReceipt';
const APPLE_API_PRODUCTION = 'https://api.storekit.itunes.apple.com';
const APPLE_API_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

function assertKnownProduct(productId) {
  const product = getProductById(productId);
  if (!product) {
    const err = new Error(`Unknown IAP product: ${productId}`);
    err.status = 400;
    throw err;
  }
  return product;
}

function canUseDevBypass() {
  return (
    process.env.NODE_ENV !== 'production' &&
    String(process.env.IAP_DEV_BYPASS || '').toLowerCase() === 'true'
  );
}

/**
 * Decode App Store JWS payload without verifying the cert chain.
 * Used only as a fallback helper when App Store Server API is configured
 * (server re-fetches the transaction) or in guarded dev bypass.
 */
function decodeAppleJwsPayload(jws) {
  if (!jws || typeof jws !== 'string' || jws.split('.').length < 3) {
    return null;
  }
  try {
    const payload = jws.split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8'
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeApplePrivateKey(raw) {
  let privateKey = String(raw || '').trim();
  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1).trim();
  }
  return privateKey.replace(/\\n/g, '\n').trim();
}

function createAppleApiToken() {
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID || 'stream.tuneable.app';
  const privateKey = normalizeApplePrivateKey(process.env.APPLE_IAP_PRIVATE_KEY);

  if (!keyId || !issuerId || !privateKey) {
    return null;
  }

  if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
    const err = new Error(
      'APPLE_IAP_PRIVATE_KEY is not a valid .p8. Paste the full file, including the BEGIN PRIVATE KEY and END PRIVATE KEY lines, and keep the line breaks (or write them as \\n).'
    );
    err.status = 503;
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    return jwt.sign(
      {
        iss: issuerId,
        iat: now,
        exp: now + 60 * 20,
        aud: 'appstoreconnect-v1',
        bid: bundleId,
      },
      privateKey,
      {
        algorithm: 'ES256',
        header: { alg: 'ES256', kid: keyId, typ: 'JWT' },
      }
    );
  } catch {
    const err = new Error(
      'APPLE_IAP_PRIVATE_KEY could not sign the App Store request. Re-paste the .p8 and check the line breaks.'
    );
    err.status = 503;
    throw err;
  }
}

function appleApiError(response, triedBothEnvironments) {
  const status = response.status;
  const code = response.data?.errorCode;
  let hint = '';
  if (status === 401) {
    hint =
      ' Apple rejected the API key. Check APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_BUNDLE_ID (stream.tuneable.app), and that APPLE_IAP_PRIVATE_KEY is the matching .p8.';
  } else if (status === 404 && triedBothEnvironments) {
    hint = ' Apple could not find that transaction in production or sandbox.';
  }
  const err = new Error(
    `Apple App Store Server API error (${status}${code ? `, ${code}` : ''}): ${JSON.stringify(response.data)}.${hint}`
  );
  err.status = 502;
  return err;
}

async function fetchAppleTransaction(transactionId, useSandbox, didFallback = false) {
  const token = createAppleApiToken();
  if (!token) return null;

  const base = useSandbox ? APPLE_API_SANDBOX : APPLE_API_PRODUCTION;
  const url = `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });

  if (response.status === 404 && !didFallback) {
    return fetchAppleTransaction(transactionId, !useSandbox, true);
  }

  if (response.status !== 200) {
    throw appleApiError(response, didFallback || response.status !== 404);
  }

  const signedTransaction = response.data?.signedTransactionInfo;
  const payload = decodeAppleJwsPayload(signedTransaction);
  if (!payload) {
    const err = new Error('Could not decode Apple signedTransactionInfo');
    err.status = 502;
    throw err;
  }
  return payload;
}

async function verifyAppleReceiptLegacy(receiptData) {
  const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET;
  if (!sharedSecret) {
    return null;
  }

  const body = {
    'receipt-data': receiptData,
    password: sharedSecret,
    'exclude-old-transactions': true,
  };

  let response = await axios.post(APPLE_PRODUCTION_VERIFY, body, { validateStatus: () => true });
  // 21007 = sandbox receipt sent to production
  if (response.data?.status === 21007) {
    response = await axios.post(APPLE_SANDBOX_VERIFY, body, { validateStatus: () => true });
  }

  if (response.data?.status !== 0) {
    const err = new Error(`Apple verifyReceipt failed with status ${response.data?.status}`);
    err.status = 400;
    throw err;
  }

  return response.data;
}

/**
 * Verify an Apple purchase.
 * Prefers App Store Server API (transactionId / JWS), falls back to legacy verifyReceipt.
 */
async function verifyApplePurchase({ productId, transactionId, purchaseToken, receiptData }) {
  const product = assertKnownProduct(productId);
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID || 'stream.tuneable.app';

  if (canUseDevBypass()) {
    console.warn('⚠️ IAP_DEV_BYPASS: skipping Apple store verification');
    return {
      product,
      storeTransactionId: transactionId || `dev-apple-${productId}-${Date.now()}`,
      environment: 'dev_bypass',
      raw: { bypass: true },
    };
  }

  // 1) App Store Server API. Prefer the transaction id inside the StoreKit 2 JWS,
  // then re-fetch that transaction from Apple before crediting.
  const decoded = purchaseToken ? decodeAppleJwsPayload(purchaseToken) : null;
  const jwsTxnId = decoded?.transactionId || decoded?.originalTransactionId;
  const resolvedTxnId = jwsTxnId || transactionId;
  const preferSandbox = decoded?.environment === 'Sandbox';

  if (resolvedTxnId && createAppleApiToken()) {
    const payload = await fetchAppleTransaction(resolvedTxnId, preferSandbox);
    if (payload.bundleId && payload.bundleId !== bundleId) {
      const err = new Error(`Apple bundleId mismatch: ${payload.bundleId}`);
      err.status = 400;
      throw err;
    }
    if (payload.productId !== productId) {
      const err = new Error(
        `Apple productId mismatch: expected ${productId}, got ${payload.productId}`
      );
      err.status = 400;
      throw err;
    }
    // Reject refunds / revocations
    if (payload.revocationDate) {
      const err = new Error('Apple transaction was revoked/refunded');
      err.status = 400;
      throw err;
    }

    return {
      product,
      storeTransactionId: String(payload.transactionId),
      environment: payload.environment || 'Production',
      storePrice: storePriceFromApplePayload(payload),
      storefront: payload.storefront || null,
      raw: payload,
    };
  }

  // 2) Legacy shared-secret receipt verification
  if (receiptData) {
    const receiptResult = await verifyAppleReceiptLegacy(receiptData);
    if (!receiptResult) {
      const err = new Error('APPLE_IAP_SHARED_SECRET is not configured');
      err.status = 503;
      throw err;
    }

    const candidates = [
      ...(receiptResult.latest_receipt_info || []),
      ...(receiptResult.receipt?.in_app || []),
    ];

    const match = candidates.find((item) => {
      if (item.product_id !== productId) return false;
      if (transactionId && String(item.transaction_id) !== String(transactionId)) return false;
      return true;
    });

    if (!match) {
      const err = new Error('No matching Apple in-app purchase found in receipt');
      err.status = 400;
      throw err;
    }

    return {
      product,
      storeTransactionId: String(match.transaction_id),
      environment: receiptResult.environment || 'unknown',
      storePrice: null,
      storefront: null,
      raw: match,
    };
  }

  // 3) If client only sent JWS and we lack Server API keys, refuse rather than trust decode
  if (purchaseToken && decodeAppleJwsPayload(purchaseToken)) {
    const err = new Error(
      'Apple App Store Server API credentials (APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY) are required to verify StoreKit 2 purchases'
    );
    err.status = 503;
    throw err;
  }

  const err = new Error(
    'Unable to verify Apple purchase: configure App Store Server API keys or send receiptData with APPLE_IAP_SHARED_SECRET'
  );
  err.status = 503;
  throw err;
}

function googleOrderUrl(packageName, orderId) {
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/orders/${encodeURIComponent(orderId)}`;
}

async function fetchGoogleOrder(auth, packageName, orderId) {
  const client = typeof auth.getClient === 'function' ? await auth.getClient() : auth;
  const url = googleOrderUrl(packageName, orderId);
  try {
    const res = await client.request({ url, method: 'GET' });
    if (res && res.data && (res.data.orderId || res.data.total || res.data.lineItems)) {
      return res.data;
    }
    return res;
  } catch (err) {
    const status = err.response?.status || err.status;
    const permissionDenied = status === 401 || status === 403;
    const wrapped = new Error(
      permissionDenied
        ? 'Google Play could not read the order price. Grant this service account the View financial data permission in Play Console.'
        : `Google Play order lookup failed${status ? ` (${status})` : ''}: ${err.message}`
    );
    wrapped.status = permissionDenied ? 503 : 502;
    wrapped.code = 'iap_price_missing';
    throw wrapped;
  }
}

/**
 * Paid Play orders must carry a price. Promo, rewarded, and zero-price
 * license tests do not, and are marked so the credit floor can skip them.
 */
async function resolveGoogleStorePrice(auth, packageName, data) {
  const purchaseType = data.purchaseType;
  if (purchaseType === 1 || purchaseType === 2) {
    return { storePrice: null, priceCheckSkip: 'unpaid_store_grant' };
  }

  if (!data.orderId) {
    if (purchaseType === 0) {
      return { storePrice: null, priceCheckSkip: 'test_purchase' };
    }
    const err = new Error('Google Play order id is missing, so the price paid cannot be checked');
    err.status = 422;
    err.code = 'iap_price_missing';
    throw err;
  }

  let order;
  try {
    order = await fetchGoogleOrder(auth, packageName, data.orderId);
  } catch (err) {
    if (purchaseType === 0) {
      console.warn('Google test purchase order price unavailable:', err.message);
      return { storePrice: null, priceCheckSkip: 'test_purchase' };
    }
    throw err;
  }

  const storePrice = priceFromGoogleOrder(order);
  if (!storePrice || storePrice.amountMajor <= 0) {
    if (purchaseType === 0) {
      return { storePrice: null, priceCheckSkip: 'test_purchase' };
    }
    const err = new Error('Google Play order has no price, so the wallet was not credited');
    err.status = 422;
    err.code = 'iap_price_missing';
    throw err;
  }

  return { storePrice, priceCheckSkip: null };
}

function getGoogleAuthClient() {
  const email = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  const jsonPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;

  if (jsonPath) {
    const auth = new google.auth.GoogleAuth({
      keyFile: jsonPath,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    return auth;
  }

  if (!email || !privateKey) {
    return null;
  }

  privateKey = privateKey.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
}

/**
 * Verify a Google Play product purchase. Acknowledgement is returned for the
 * caller to run after the wallet credit succeeds.
 */
async function verifyGooglePurchase({ productId, purchaseToken, packageName }) {
  const product = assertKnownProduct(productId);
  const pkg = packageName || process.env.GOOGLE_PLAY_PACKAGE_NAME || 'stream.tuneable.app';

  if (canUseDevBypass()) {
    console.warn('⚠️ IAP_DEV_BYPASS: skipping Google Play verification');
    return {
      product,
      storeTransactionId: purchaseToken || `dev-google-${productId}-${Date.now()}`,
      environment: 'dev_bypass',
      raw: { bypass: true },
    };
  }

  const auth = getGoogleAuthClient();
  if (!auth) {
    const err = new Error(
      'Google Play credentials missing (GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL + PRIVATE_KEY, or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)'
    );
    err.status = 503;
    throw err;
  }

  if (!purchaseToken) {
    const err = new Error('purchaseToken is required for Google Play verification');
    err.status = 400;
    throw err;
  }

  const androidpublisher = google.androidpublisher({ version: 'v3', auth });

  const { data } = await androidpublisher.purchases.products.get({
    packageName: pkg,
    productId,
    token: purchaseToken,
  });

  // 0 = purchased, 1 = canceled, 2 = pending
  if (data.purchaseState !== 0) {
    const err = new Error(`Google purchase not completed (state=${data.purchaseState})`);
    err.status = 400;
    throw err;
  }

  const { storePrice, priceCheckSkip } = await resolveGoogleStorePrice(auth, pkg, data);

  const storeTransactionId =
    data.orderId || `${pkg}:${productId}:${purchaseToken.slice(0, 32)}`;

  return {
    product,
    storeTransactionId: String(storeTransactionId),
    environment: data.purchaseType === 0 ? 'test' : 'production',
    storePrice,
    priceCheckSkip,
    regionCode: data.regionCode || null,
    raw: data,
    // Acknowledge only after the wallet credit succeeds. An unacknowledged
    // Play purchase is refunded automatically after 3 days.
    acknowledge: async () => {
      if (data.acknowledgementState !== 0) return;
      await androidpublisher.purchases.products.acknowledge({
        packageName: pkg,
        productId,
        token: purchaseToken,
        requestBody: {},
      });
    },
  };
}

module.exports = {
  verifyApplePurchase,
  verifyGooglePurchase,
  decodeAppleJwsPayload,
  canUseDevBypass,
};
