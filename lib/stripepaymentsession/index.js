"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Initialize Stripe node SDK with your secret key
// Ensure you have set this in your Firebase environment configuration
// firebase functions:config:set stripe.secret="sk_YOUR_SECRET_KEY"
// firebase functions:config:set stripe.publishable="pk_YOUR_PUBLISHABLE_KEY" // If needed by function
const stripe = require("stripe")(functions.config().stripe.secret);
admin.initializeApp();
exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d;
    // Enable CORS for all origins for this function, customize as needed for production
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
    if (req.method === "OPTIONS") {
        // Pre-flight request. Reply successfully:
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const data = req.body;
    functions.logger.info("Received request to create checkout session:", {
        body: data,
    });
    // Basic validation
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
    if (!data.email) {
        functions.logger.warn("Missing email, Stripe will ask for it.");
        // Stripe can collect email if not provided, but it's good practice to send if available
    }
    if (!data.orderId) {
        functions.logger.error("Validation Error: Missing orderId for client_reference_id.");
        res.status(400).json({ error: "Missing required field: orderId." });
        return;
    }
    // Validate each line item
    for (const item of data.line_items) {
        if (!item.price_data || !item.price_data.unit_amount || item.price_data.unit_amount < 50) {
            functions.logger.error("Validation Error: Invalid line_item amount.", { item });
            res.status(400).json({ error: `Invalid line_item: amount must be at least 50 cents. Problem with item: ${(_b = (_a = item.price_data) === null || _a === void 0 ? void 0 : _a.product_data) === null || _b === void 0 ? void 0 : _b.name}` });
            return;
        }
        if (!item.quantity || item.quantity < 1) {
            functions.logger.error("Validation Error: Invalid line_item quantity.", { item });
            res.status(400).json({ error: `Invalid line_item: quantity must be at least 1. Problem with item: ${(_d = (_c = item.price_data) === null || _c === void 0 ? void 0 : _c.product_data) === null || _d === void 0 ? void 0 : _d.name}` });
            return;
        }
        if (item.price_data.currency.toLowerCase() !== "gtq") {
            functions.logger.error("Validation Error: Invalid currency in line_item. Must be GTQ.", { item });
            res.status(400).json({ error: "Invalid currency: All line items must be in GTQ." });
            return;
        }
    }
    try {
        const sessionParams = {
            payment_method_types: ["card"],
            mode: "payment",
            line_items: data.line_items,
            success_url: data.returnUrl,
            cancel_url: data.cancelUrl,
            client_reference_id: data.orderId,
            // currency: 'gtq', // Not needed at top level if all line items have it. Stripe infers from line_items.
        };
        if (data.email) {
            sessionParams.customer_email = data.email;
        }
        // Add metadata if provided by the client
        if (data.metadata) {
            sessionParams.metadata = data.metadata;
        }
        else {
            // Default metadata if none provided
            sessionParams.metadata = { order_id: data.orderId };
        }
        // If customerName is provided, you can use it to prefill.
        // Otherwise, Stripe's form will collect it if needed.
        // Example: if (data.customerName) { sessionParams.customer_details = { name: data.customerName }; }
        functions.logger.info("Creating Stripe session with params:", sessionParams);
        const session = await stripe.checkout.sessions.create(sessionParams);
        functions.logger.info("Stripe session created successfully:", { sessionId: session.id });
        // Send back the session ID and the URL for redirection
        res.status(200).json({
            id: session.id,
            sessionId: session.id,
            url: session.url, // Redirect URL
        });
    }
    catch (error) {
        functions.logger.error("Stripe API Error:", error);
        // Send a more generic error to the client, log the detailed one
        let clientErrorMessage = "Failed to create checkout session.";
        if (error.type === 'StripeInvalidRequestError') {
            clientErrorMessage = `Stripe Error: ${error.message}`;
            if (error.param) {
                clientErrorMessage += ` (Parameter: ${error.param})`;
            }
        }
        else if (error.message && error.message.includes("Amount must be at least")) {
            clientErrorMessage = error.message; // Pass Stripe's specific "Amount must be..." message
        }
        res.status(500).json({ error: clientErrorMessage, details: error.message });
    }
});
//# sourceMappingURL=index.js.map