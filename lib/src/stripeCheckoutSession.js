"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colibriCheckoutSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// Initialize Firebase Admin SDK only if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}
// Define the secret for Stripe
const stripeSecretKey = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
exports.colibriCheckoutSession = (0, https_1.onRequest)({ secrets: [stripeSecretKey] }, async (req, res) => {
    var _a, _b, _c, _d;
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
    if (req.method === "OPTIONS") {
        logger.info("Responding to OPTIONS request.");
        res.status(204).send("");
        return;
    }
    // Initialize Stripe client with the secret
    let stripeClient;
    try {
        if (!stripeSecretKey.value()) {
            logger.error("STRIPE_SECRET_KEY not available");
            res.status(500).json({ error: "Stripe configuration error. Please check server logs." });
            return;
        }
        stripeClient = require("stripe")(stripeSecretKey.value());
        logger.info("Stripe client initialized successfully.");
    }
    catch (error) {
        logger.error("Failed to initialize Stripe:", error);
        res.status(500).json({ error: "Stripe configuration error. Please check server logs.", details: error.message });
        return;
    }
    if (req.method !== "POST") {
        logger.warn("Method Not Allowed:", { method: req.method });
        res.status(405).send("Method Not Allowed");
        return;
    }
    const data = req.body;
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
            res.status(400).json({ error: `Invalid line_item: amount must be at least 50 cents. Problem with item: ${(_b = (_a = item.price_data) === null || _a === void 0 ? void 0 : _a.product_data) === null || _b === void 0 ? void 0 : _b.name}` });
            return;
        }
        if (!item.quantity || item.quantity < 1) {
            logger.error("Validation Error: Invalid line_item quantity.", { item });
            res.status(400).json({ error: `Invalid line_item: quantity must be at least 1. Problem with item: ${(_d = (_c = item.price_data) === null || _c === void 0 ? void 0 : _c.product_data) === null || _d === void 0 ? void 0 : _d.name}` });
            return;
        }
        if (item.price_data.currency.toLowerCase() !== "gtq") {
            logger.error("Validation Error: Invalid currency in line_item. Must be GTQ.", { item });
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
        };
        if (data.email) {
            sessionParams.customer_email = data.email;
        }
        if (data.metadata) {
            sessionParams.metadata = data.metadata;
        }
        else {
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
    }
    catch (error) {
        logger.error("Stripe API Error creating session:", error);
        let clientErrorMessage = "Failed to create checkout session.";
        if (error.type === 'StripeInvalidRequestError') {
            clientErrorMessage = `Stripe Error: ${error.message}`;
            if (error.param) {
                clientErrorMessage += ` (Parameter: ${error.param})`;
            }
        }
        else if (error.message && error.message.includes("Amount must be at least")) {
            clientErrorMessage = error.message;
        }
        res.status(500).json({ error: clientErrorMessage, details: error.message });
    }
});
//# sourceMappingURL=stripeCheckoutSession.js.map