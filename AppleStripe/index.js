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
 * HTTP endpoint for creating a payment sheet for Apple Pay.
 * Expects a JSON POST body with { amount, currency, email or customer_email, name?, order?, setup_future_usage?, save_payment_method? }
 */
exports.applePaymentSheet = functions.https.onRequest((req, res) => {
  // Enable CORS for any origin
  cors(req, res, async () => {
    // Only allow POST
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Only POST allowed' });
    }

    const { 
      amount, 
      currency, 
      email, 
      customer_email, 
      name, 
      order,
      setup_future_usage,
      save_payment_method 
    } = req.body || {};
    
    // Use email or customer_email (prioritize email if both exist)
    const customerEmail = email || customer_email;

    // Basic validation
    if (
      typeof amount !== 'number' ||
      !currency ||
      !customerEmail
    ) {
      return res
        .status(400)
        .json({ error: 'Missing or invalid required fields: amount (number), currency, email or customer_email' });
    }

    try {
      console.log(`applePaymentSheet: ${customerEmail} ${amount} ${currency}`);

      // 1) Find or create a Stripe Customer
      let customer;
      const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
      if (existing.data.length) {
        customer = existing.data[0];
        console.log(`→ existing customer ${customer.id}`);
      } else {
        customer = await stripe.customers.create({ email: customerEmail, name: name || customerEmail });
        console.log(`→ new customer ${customer.id}`);
      }

      // 2) Create an ephemeral key for the mobile PaymentSheet
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customer.id },
        { apiVersion: '2024-06-20' }
      );
      console.log(`→ ephemeralKey ${ephemeralKey.id}`);

      // 3) Create a PaymentIntent
      const paymentIntentOptions = {
        amount: Math.round(amount),           // integer cents
        currency: currency.toLowerCase(),
        customer: customer.id,
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId:    order?.customerId || '',
          orderId:   order?.id         || '',
          restaurantId: order?.restaurantId || '',
          email:     customerEmail,
          source:    'mobile',
          save_card: save_payment_method ? 'true' : 'false',
        },
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
      return res.json({
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        ephemeralKey:  ephemeralKey.secret,
        customer:      customer.id,
        customerId:    customer.id, // Add alternative name for compatibility
        publishableKey: stripePublishable,
        amount,
        currency,
      });
    } catch (err) {
      console.error('applePaymentSheet error', err);
      // return a proper HTTP error
      return res
        .status(500)
        .json({ error: err.message ?? 'Internal server error' });
    }
  });
});
