// index.js
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const cors      = require('cors')({ origin: true });
const Stripe    = require('stripe');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Read your Stripe secrets from functions config
const stripeSecret      = functions.config().stripe.secret;
const stripePublishable = functions.config().stripe.publishable;
const stripe            = Stripe(stripeSecret);

/**
 * Callable endpoint for creating a payment sheet.
 * Expects parameters with { amount, currency, email, name?, order?, setup_future_usage?, save_payment_method? }
 */
exports.createPaymentSheet = functions.https.onCall(async (data, context) => {
  let { amount, currency, email, name, order, setup_future_usage, save_payment_method } = data || {};

  // Log the full request body for debugging
  console.log(`Received request: ${JSON.stringify(data, null, 2)}`);

  // Basic validation with better error messages
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'amount must be a positive number'
    );
  }

  if (!currency || typeof currency !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'currency must be a valid string'
    );
  }

  if (!email || typeof email !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'email must be a valid string'
    );
  }

  // Normalize currency to uppercase
  currency = currency.toUpperCase();

  // Ensure amount is an integer (Stripe requires integer amount in cents)
  amount = Math.round(amount);

  try {
    console.log(`createPaymentSheet: ${email} ${amount} ${currency}`);

    // 1) Find or create a Stripe Customer
    let customer;
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length) {
      customer = existing.data[0];
      console.log(`→ existing customer ${customer.id}`);
    } else {
      customer = await stripe.customers.create({ email, name: name || email });
      console.log(`→ new customer ${customer.id}`);
    }

    // 2) Create an ephemeral key for the mobile PaymentSheet
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2024-06-20' }
    );
    console.log(`→ ephemeralKey ${ephemeralKey.id}`);

    // 3) Create a PaymentIntent
    // Setup metadata object safely
    const metadata = {
      userId:    order?.customerId || '',
      orderId:   order?.id         || '',
      restaurantId: order?.restaurantId || '',
      source:    'mobile',
      save_card: save_payment_method ? 'true' : 'false',
    };

    // Log the metadata for debugging
    console.log(`→ metadata: ${JSON.stringify(metadata, null, 2)}`);

    // Prepare the payment intent creation options
    const paymentIntentOptions = {
      amount: amount,
      currency: currency.toLowerCase(),
      customer: customer.id,
      metadata: metadata,
      automatic_payment_methods: { enabled: true },
    };
    
    // Add setup_future_usage if needed for saving cards
    if (setup_future_usage === 'on_session' || setup_future_usage === 'off_session' || save_payment_method) {
      paymentIntentOptions.setup_future_usage = setup_future_usage || 'on_session';
      console.log(`→ Enabling setup_future_usage: ${paymentIntentOptions.setup_future_usage}`);
    }

    const intent = await stripe.paymentIntents.create(paymentIntentOptions);
    console.log(`→ paymentIntent ${intent.id}`);
    
    // 4) If requested, update payment methods to allow_redisplay=always
    if (save_payment_method) {
      try {
        // Get customer's payment methods
        const paymentMethods = await stripe.paymentMethods.list({
          customer: customer.id,
          type: 'card',
        });
        
        // Update allow_redisplay for each payment method
        for (const pm of paymentMethods.data) {
          await stripe.paymentMethods.update(pm.id, {
            allow_redisplay: 'always'
          });
          console.log(`→ Updated payment method ${pm.id} to allow_redisplay=always`);
        }
      } catch (pmError) {
        console.error('Error updating payment methods:', pmError);
        // Continue with response - this is not a critical error
      }
    }

    // 5) Return exactly what the Flutter SDK needs
    return {
      paymentIntent: intent.client_secret,
      ephemeralKey:  ephemeralKey.secret,
      customer:      customer.id,
      publishableKey: stripePublishable,
      paymentIntentId: intent.id,
      amount,
      currency,
    };
  } catch (err) {
    console.error('createPaymentSheet error', err);
    throw new functions.https.HttpsError('internal', err.message || 'Internal server error');
  }
});

/**
 * Callable function for retrieving saved payment methods.
 * Expects parameters with { email }
 */
exports.retrieveAndroidPaymentMethods = functions.https.onCall(async (data, context) => {
  const { email } = data || {};

  // Basic validation
  if (!email) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'Email is required'
    );
  }

  try {
    console.log(`retrievePaymentMethods for email: ${email}`);

    // 1) Find customer by email
    const customers = await stripe.customers.list({
      email: email,
      limit: 1
    });
    
    if (customers.data.length === 0) {
      // No customer found with this email
      console.log(`No customer found with email: ${email}`);
      return { paymentMethods: [] };
    }
    
    const customerId = customers.data[0].id;
    console.log(`Found customer: ${customerId}`);
    
    // 2) Retrieve payment methods for this customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    
    console.log(`Retrieved ${paymentMethods.data.length} payment methods`);
    
    // 3) Return the payment methods and customer ID
    return { 
      paymentMethods: paymentMethods.data,
      customer: customerId
    };
  } catch (err) {
    console.error('retrievePaymentMethods error', err);
    throw new functions.https.HttpsError('internal', err.message || 'Internal server error');
  }
});
