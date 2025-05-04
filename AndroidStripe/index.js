const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret);

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Create a payment sheet for Android with all required parameters:
 * - PaymentIntent client secret
 * - Customer ID
 * - Ephemeral Key
 * - Publishable Key
 */
exports.createPaymentSheet = functions.https.onCall(async (data, context) => {
  // Log the request for debugging
  console.log('createPaymentSheet called with data:', JSON.stringify(data));
  
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to create a payment'
    );
  }
  
  try {
    const { amount, currency, email, name, order } = data;
    
    // Validate inputs
    if (!amount || !currency || !email) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields (amount, currency, email)'
      );
    }
    
    console.log(`Creating payment sheet for ${email}, amount: ${amount} ${currency}`);
    
    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log(`Using existing customer: ${customer.id}`);
    } else {
      customer = await stripe.customers.create({
        email: email,
        name: name || email
      });
      console.log(`Created new customer: ${customer.id}`);
    }
    
    // Create ephemeral key for this customer
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2024-06-20' }
    );
    console.log(`Created ephemeral key: ${ephemeralKey.id}`);
    
    // Create payment intent
    const paymentIntentData = {
      amount: Math.round(amount), // ensure integer
      currency: currency.toLowerCase(),
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
      // Add metadata from order if available
      metadata: {
        userId: context.auth.uid,
        orderId: order?.id || '',
        restaurantId: order?.restaurantId || '',
        orderType: 'mobile'
      }
    };
    
    console.log('Creating payment intent with data:', JSON.stringify(paymentIntentData));
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
    console.log(`Created payment intent: ${paymentIntent.id}`);
    
    // Return all data required for PaymentSheet
    const result = {
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      publishableKey: functions.config().stripe.publishable,
      amount: amount,
      currency: currency
    };
    
    console.log('Returning payment sheet data (secrets redacted)');
    return result;
  } catch (error) {
    console.error('Stripe payment sheet error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
}); 