import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK only if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Define the secret for Stripe
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

// Define the expected structure of a line item from the client
interface LineItem {
  price_data: {
    currency: string;
    product_data: {
      name: string;
    };
    unit_amount: number; // Amount in cents
  };
  quantity: number;
}

// Define the expected request body structure
interface CreateCheckoutSessionRequest {
  email: string;
  returnUrl: string;
  cancelUrl: string;
  orderId: string;
  customerName?: string;
  line_items: LineItem[];
  platform?: string;
  metadata?: { [key: string]: string | number };
}

export const colibriCheckoutSession = onRequest(
  { secrets: [stripeSecretKey] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") {
      logger.info("Responding to OPTIONS request.");
      res.status(204).send("");
      return;
    }

    // Initialize Stripe client with the secret
    let stripeClient: any;
    try {
      if (!stripeSecretKey.value()) {
        logger.error("STRIPE_SECRET_KEY not available");
        res.status(500).json({ error: "Stripe configuration error. Please check server logs." });
        return;
      }
      stripeClient = require("stripe")(stripeSecretKey.value());
      logger.info("Stripe client initialized successfully.");
    } catch (error: any) {
      logger.error("Failed to initialize Stripe:", error);
      res.status(500).json({ error: "Stripe configuration error. Please check server logs.", details: error.message });
      return;
    }

    if (req.method !== "POST") {
      logger.warn("Method Not Allowed:", { method: req.method });
      res.status(405).send("Method Not Allowed");
      return;
    }

    const data = req.body as CreateCheckoutSessionRequest;
    logger.info("Received request to create checkout session:", { body: data });

    if (!data.line_items || data.line_items.length === 0) {
      logger.error("Validation Error: Missing line_items.");
      res.status(400).json({ error: "Missing required field: line_items." });
      return;
    }
    if (!data.returnUrl) {
      logger.error("Validation Error: Missing returnUrl.");
      res.status(400).json({ error: "Missing required field: returnUrl (for success_url)." });
      return;
    }
    if (!data.cancelUrl) {
      logger.error("Validation Error: Missing cancelUrl.");
      res.status(400).json({ error: "Missing required field: cancelUrl." });
      return;
    }
    if (!data.orderId) {
      logger.error("Validation Error: Missing orderId for client_reference_id.");
      res.status(400).json({ error: "Missing required field: orderId." });
      return;
    }

    for (const item of data.line_items) {
      if (!item.price_data || !item.price_data.unit_amount || item.price_data.unit_amount < 50) {
        logger.error("Validation Error: Invalid line_item amount.", { item });
        res.status(400).json({ error: `Invalid line_item: amount must be at least 50 cents. Problem with item: ${item.price_data?.product_data?.name}` });
        return;
      }
      if (!item.quantity || item.quantity < 1) {
        logger.error("Validation Error: Invalid line_item quantity.", { item });
        res.status(400).json({ error: `Invalid line_item: quantity must be at least 1. Problem with item: ${item.price_data?.product_data?.name}` });
        return;
      }
      if (item.price_data.currency.toLowerCase() !== "gtq") {
        logger.error("Validation Error: Invalid currency in line_item. Must be GTQ.", { item });
        res.status(400).json({ error: "Invalid currency: All line items must be in GTQ." });
        return;
      }
    }

    try {
      const sessionParams: any = {
        payment_method_types: ["card"],
        mode: "payment",
        line_items: data.line_items,
        success_url: data.returnUrl,
        cancel_url: data.cancelUrl,
        client_reference_id: data.orderId,
      };
      if (data.email) {
        sessionParams.customer_email = data.email;
      }
      if (data.metadata) {
        sessionParams.metadata = data.metadata;
      } else {
        sessionParams.metadata = { order_id: data.orderId };
      }

      logger.info("Creating Stripe session with params:", sessionParams);
      const session = await stripeClient.checkout.sessions.create(sessionParams);
      logger.info("Stripe session created successfully:", { sessionId: session.id });

      res.status(200).json({
        id: session.id,
        sessionId: session.id,
        url: session.url,
      });
    } catch (error: any) {
      logger.error("Stripe API Error creating session:", error);
      let clientErrorMessage = "Failed to create checkout session.";
      if (error.type === 'StripeInvalidRequestError') {
        clientErrorMessage = `Stripe Error: ${error.message}`;
        if (error.param) {
          clientErrorMessage += ` (Parameter: ${error.param})`;
        }
      } else if (error.message && error.message.includes("Amount must be at least")) {
        clientErrorMessage = error.message;
      }
      res.status(500).json({ error: clientErrorMessage, details: error.message });
    }
  }
); 