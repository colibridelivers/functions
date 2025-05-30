"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK only if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}
let stripeClient;
let stripeInitializationError = null;
try {
    const stripeConfig = functions.config().stripe;
    if (!stripeConfig) {
        stripeInitializationError = "Stripe config (functions.config().stripe) is missing.";
        functions.logger.error(stripeInitializationError);
    }
    else if (!stripeConfig.secret) {
        stripeInitializationError = "Stripe secret key (functions.config().stripe.secret) is missing.";
        functions.logger.error(stripeInitializationError);
    }
    else {
        stripeClient = require("stripe")(stripeConfig.secret);
        functions.logger.info("Stripe client initialized successfully.");
    }
}
catch (error) {
    stripeInitializationError = `Failed to initialize Stripe: ${error.message}`;
    functions.logger.error(stripeInitializationError, error);
}
exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d;
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
    const data = req.body;
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
        functions.logger.info("Creating Stripe session with params:", sessionParams);
        const session = await stripeClient.checkout.sessions.create(sessionParams);
        functions.logger.info("Stripe session created successfully:", { sessionId: session.id });
        res.status(200).json({
            id: session.id,
            sessionId: session.id,
            url: session.url,
        });
    }
    catch (error) {
        functions.logger.error("Stripe API Error creating session:", error);
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
//# sourceMappingURL=index.js.map