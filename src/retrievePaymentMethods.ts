/**
 * Retrieve saved payment methods for a customer
 */
import * as functions from "firebase-functions";
import * as Stripe from "stripe";
import * as logger from "firebase-functions/logger";

// Get the Stripe API key from Firebase config
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret;

// Initialize Stripe with the secret key
const stripe = new Stripe(stripeSecretKey as string, {
  apiVersion: "2023-10-16", // Use a specific API version
});

// Function to retrieve payment methods
export const retrievePaymentMethods = functions.https.onCall(async (data, context) => {
  // Log the request for debugging
  logger.info("Retrieve payment methods request", {
    data: data,
    auth: context.auth ? { uid: context.auth.uid } : null,
  });

  try {
    // Extract email from the request
    const { email } = data;
    
    if (!email) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Email is required"
      );
    }
    
    // Find customer by email
    const customerList = await stripe.customers.list({
      email: email,
      limit: 1,
    });
    
    if (customerList.data.length === 0) {
      // No customer found with this email
      return { paymentMethods: [] };
    }
    
    const customer = customerList.data[0];
    logger.info(`Found customer for email ${email}`, { customerId: customer.id });
    
    // Retrieve payment methods for this customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: "card",
    });
    
    // Update allow_redisplay for all payment methods to ensure they display in Payment Sheet
    for (const pm of paymentMethods.data) {
      await stripe.paymentMethods.update(pm.id, {
        allow_redisplay: "always",
      });
      logger.info(`Updated payment method ${pm.id} to allow_redisplay=always`);
    }
    
    // Return the payment methods
    return { 
      paymentMethods: paymentMethods.data,
      customerId: customer.id
    };
  } catch (error) {
    logger.error("Error retrieving payment methods", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred"
    );
  }
}); 