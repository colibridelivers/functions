const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const cors      = require('cors')({ origin: true });
const Stripe    = require('stripe');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Read your Stripe secrets from functions config
const stripeSecret = functions.config().stripe.secret;
const stripe       = Stripe(stripeSecret);

/**
 * HTTP endpoint for retrieving saved payment methods.
 * Expects a JSON POST body with { email }
 */
exports.retrievePaymentMethods = functions.https.onRequest((req, res) => {
  // Enable CORS for any origin
  cors(req, res, async () => {
    // Only allow POST
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Only POST allowed' });
    }

    const { email } = req.body || {};

    // Basic validation
    if (!email) {
      return res.status(400).json({ 
        error: { 
          message: "Email is required" 
        }
      });
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
        return res.json({ paymentMethods: [] });
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
      return res.json({ 
        paymentMethods: paymentMethods.data,
        customer: customerId
      });
    } catch (err) {
      console.error('retrievePaymentMethods error', err);
      // Return a proper HTTP error
      return res.status(500).json({ 
        error: { 
          message: err.message || 'Internal server error' 
        }
      });
    }
  });
}); 