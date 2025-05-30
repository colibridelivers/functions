/**
 * Android-specific Stripe payment function
 * Creates a payment sheet for Android clients
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as Stripe from "stripe";
import * as logger from "firebase-functions/logger";

// Initialize Firebase Admin if it hasn't been initialized yet
if (!admin.apps.length) {
  admin.initializeApp();
}

// Get the Stripe API keys from Firebase config
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret;
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || functions.config().stripe?.publishable;

// Initialize Stripe with the secret key
const stripe = new Stripe(stripeSecretKey as string, {
  apiVersion: "2023-10-16", // Use a specific API version
});

// Function to create a payment sheet for Android
export const createAndroidPaymentSheet = functions.https.onCall(async (data, context) => {
  // Log the request for debugging
  logger.info("Android payment sheet request", {
    data: data,
    auth: context.auth ? { uid: context.auth.uid } : null,
  });

  try {
    // Basic validation
    if (!data.amount || !data.currency) {
      throw new Error("Missing required fields: amount, currency");
    }

    // Extract data from the request
    const amount = Math.round(Number(data.amount)); // Ensure amount is an integer
    const currency = (data.currency || "gtq").toLowerCase(); // Default to GTQ
    const email = data.email || "";
    const name = data.name || email;
    const order = data.order || {};
    const metadata = data.metadata || {};

    // Find or create a customer
    let customer;
    if (email) {
      // Look for an existing customer with this email
      const customers = await stripe.customers.list({
        email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customer = customers.data[0];
        logger.info(`Using existing customer: ${customer.id}`);
      } else {
        // Create a new customer
        customer = await stripe.customers.create({
          email,
          name,
        });
        logger.info(`Created new customer: ${customer.id}`);
      }
    } else {
      // Create an anonymous customer if no email provided
      customer = await stripe.customers.create({});
      logger.info(`Created anonymous customer: ${customer.id}`);
    }

    // Create an ephemeral key for the customer (needed for mobile SDKs)
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: "2023-10-16" }
    );
    logger.info(`Created ephemeral key: ${ephemeralKey.id}`);

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customer.id,
      metadata: {
        ...metadata,
        platform: "android",
        order_id: order.id || "unknown",
        customer_id: order.customerId || context.auth?.uid || "unknown",
        restaurant: order.restaurantName || "Unknown Restaurant",
      },
      // Enable all possible payment methods
      automatic_payment_methods: { enabled: true },
    });
    logger.info(`Created payment intent: ${paymentIntent.id}`);

    // Return the data needed by the Flutter app
    return {
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      publishableKey: stripePublishableKey,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    // Log the error
    logger.error("Error creating Android payment sheet", error);
    
    // Return a structured error response
    throw new functions.https.HttpsError(
      "internal",
      error instanceof Error ? error.message : "Unknown error",
      { original: error }
    );
  }
}); 