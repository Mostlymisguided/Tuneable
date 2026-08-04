const axios = require('axios');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { getProductById } = require('./iapProducts');

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

function createAppleApiToken() {
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID || 'stream.tuneable.app';
  let privateKey = process.env.APPLE_IAP_PRIVATE_KEY || '';

  if (!keyId || !issuerId || !privateKey) {
    return null;
  }

  // Allow \n-escaped keys in .env
  privateKey = privateKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
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
}

async function fetchAppleTransaction(transactionId, useSandbox) {
  const token = createAppleApiToken();
  if (!token) return null;

  const base = useSandbox ? APPLE_API_SANDBOX : APPLE_API_PRODUCTION;
  const url = `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });

  if (response.status === 404 && !useSandbox) {
    return fetchAppleTransaction(transactionId, true);
  }

  if (response.status !== 200) {
    const err = new Error(
      `Apple App Store Server API error (${response.status}): ${JSON.stringify(response.data)}`
    );
    err.status = 502;
    throw err;
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

  // 1) App Store Server API via transaction id (from client or JWS payload)
  let resolvedTxnId = transactionId;
  if (!resolvedTxnId && purchaseToken) {
    const decoded = decodeAppleJwsPayload(purchaseToken);
    resolvedTxnId = decoded?.transactionId || decoded?.originalTransactionId;
  }

  if (resolvedTxnId && createAppleApiToken()) {
    const payload = await fetchAppleTransaction(resolvedTxnId, false);
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
 * Verify a Google Play product purchase and acknowledge it.
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

  // Acknowledge if needed (0 = yet to be acknowledged)
  if (data.acknowledgementState === 0) {
    try {
      await androidpublisher.purchases.products.acknowledge({
        packageName: pkg,
        productId,
        token: purchaseToken,
        requestBody: {},
      });
    } catch (ackErr) {
      console.warn('Google Play acknowledge warning:', ackErr.message);
    }
  }

  const storeTransactionId =
    data.orderId || `${pkg}:${productId}:${purchaseToken.slice(0, 32)}`;

  return {
    product,
    storeTransactionId: String(storeTransactionId),
    environment: data.purchaseType === 0 ? 'test' : 'production',
    raw: data,
  };
}

module.exports = {
  verifyApplePurchase,
  verifyGooglePurchase,
  decodeAppleJwsPayload,
  canUseDevBypass,
};
