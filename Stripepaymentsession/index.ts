import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK only if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

let stripeClient: any;
let stripeInitializationError: string | null = null;

try {
  const stripeConfig = functions.config().stripe;
  if (!stripeConfig) {
    stripeInitializationError = "Stripe config (functions.config().stripe) is missing.";
    functions.logger.error(stripeInitializationError);
  } else if (!stripeConfig.secret) {
    stripeInitializationError = "Stripe secret key (functions.config().stripe.secret) is missing.";
    functions.logger.error(stripeInitializationError);
  } else {
    stripeClient = require("stripe")(stripeConfig.secret);
    functions.logger.info("Stripe client initialized successfully.");
  }
} catch (error: any) {
  stripeInitializationError = `Failed to initialize Stripe: ${error.message}`;
  functions.logger.error(stripeInitializationError, error);
}

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

export const createCheckoutSession = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    functions.logger.info("Responding to OPTIONS request.");
    res.status(204).send("");
    return;
  }

  // Check if Stripe failed to initialize
  if (!stripeClient) {
    functions.logger.error("Stripe client is not initialized. Cannot process request.", { error: stripeInitializationError });
    res.status(500).json({ error: "Stripe configuration error. Please check server logs.", details: stripeInitializationError });
    return;
  }

  if (req.method !== "POST") {
    functions.logger.warn("Method Not Allowed:", { method: req.method });
    res.status(405).send("Method Not Allowed");
    return;
  }

  const data = req.body as CreateCheckoutSessionRequest;
  functions.logger.info("Received request to create checkout session:", { body: data });

  if (!data.line_items || data.line_items.length === 0) {
    functions.logger.error("Validation Error: Missing line_items.");
    res.status(400).json({ error: "Missing required field: line_items." });
    return;
  }
  if (!data.returnUrl) {
    functions.logger.error("Validation Error: Missing returnUrl.");
    res.status(400).json({ error: "Missing required field: returnUrl (for success_url)." });
    return;
  }
   if (!data.cancelUrl) {
    functions.logger.error("Validation Error: Missing cancelUrl.");
    res.status(400).json({ error: "Missing required field: cancelUrl." });
    return;
  }
  if (!data.orderId) {
      functions.logger.error("Validation Error: Missing orderId for client_reference_id.");
      res.status(400).json({ error: "Missing required field: orderId." });
      return;
  }

  for (const item of data.line_items) {
    // Get the currency for this item
    const currency = item.price_data?.currency?.toLowerCase() || 'usd';
    
    // Define minimum amounts per currency (in minor units)
    const minimumAmounts: { [key: string]: number } = {
      'usd': 50,     // $0.50
      'eur': 50,     // €0.50
      'gbp': 30,     // £0.30
      'gtq': 1500,   // Q15.00 (based on Stripe's GTQ requirements)
      'mxn': 1000,   // $10 MXN
      'cad': 50,     // $0.50 CAD
      // Add other currencies as needed
    };
    
    // Get the minimum amount for this currency, default to 50 if not found
    const minimumAmount = minimumAmounts[currency] || 50;
    
    if (!item.price_data || !item.price_data.unit_amount || item.price_data.unit_amount < minimumAmount) {
      functions.logger.error("Validation Error: Invalid line_item amount.", { item, currency, minimumAmount });
      res.status(400).json({ 
        error: `Invalid line_item: amount must be at least ${minimumAmount} ${currency.toUpperCase()} minor units. Problem with item: ${item.price_data?.product_data?.name}` 
      });
      return;
    }
    if (!item.quantity || item.quantity < 1) {
      functions.logger.error("Validation Error: Invalid line_item quantity.", { item });
      res.status(400).json({ error: `Invalid line_item: quantity must be at least 1. Problem with item: ${item.price_data?.product_data?.name}` });
      return;
    }
    
    // Allow GTQ and other supported currencies (remove the GTQ-only restriction)
    const supportedCurrencies = ['gtq', 'usd', 'eur', 'mxn', 'cad']; // Add more as needed
    if (!supportedCurrencies.includes(currency)) {
        functions.logger.error("Validation Error: Unsupported currency in line_item.", { item, currency });
        res.status(400).json({ error: `Unsupported currency: ${currency.toUpperCase()}. Supported currencies: ${supportedCurrencies.join(', ').toUpperCase()}`});
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

    functions.logger.info("Creating Stripe session with params:", sessionParams);
    const session = await stripeClient.checkout.sessions.create(sessionParams);
    functions.logger.info("Stripe session created successfully:", { sessionId: session.id });

    res.status(200).json({
      id: session.id,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    functions.logger.error("Stripe API Error creating session:", error);
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
}); 