import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import Stripe from 'stripe';
import * as cors from 'cors';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

// Enable CORS for all origins
const corsHandler = cors({ origin: true });

export const modernCheckout = onRequest({ cors: true }, async (request, response) => {
  return new Promise<void>((resolve) => {
    corsHandler(request, response, async () => {
      try {
        logger.info('Modern checkout request received', { body: request.body });

        if (request.method !== 'POST') {
          response.status(405).json({ error: 'Method not allowed' });
          resolve();
          return;
        }

        const {
          amount,
          currency = 'gtq',
          email,
          platform = 'web',
          orderData,
          returnUrl,
        } = request.body;

        // Validate required fields
        if (!amount || !email) {
          response.status(400).json({ 
            error: 'Missing required fields: amount and email are required' 
          });
          resolve();
          return;
        }

        // Ensure amount meets GTQ minimum (Q15.00 = 1500 cents)
        const amountInCents = Math.round(amount);
        if (amountInCents < 1500) {
          response.status(400).json({ 
            error: 'Amount must be at least Q15.00 (1500 cents) for GTQ currency' 
          });
          resolve();
          return;
        }

        logger.info('Processing payment', { 
          amountInCents, 
          currency, 
          email, 
          platform 
        });

        // Create or retrieve customer
        let customer;
        const existingCustomers = await stripe.customers.list({
          email: email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
          logger.info('Found existing customer', { customerId: customer.id });
        } else {
          customer = await stripe.customers.create({
            email: email,
            name: orderData?.customerName || 'Customer',
            metadata: {
              platform: platform,
              created_by: 'colibri_app',
            },
          });
          logger.info('Created new customer', { customerId: customer.id });
        }

        if (platform === 'web') {
          // For web: Create Checkout Session
          const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            payment_method_types: ['card'],
            line_items: [
              {
                price_data: {
                  currency: currency,
                  product_data: {
                    name: 'Food Delivery Order',
                    description: `Order from ${orderData?.restaurantName || 'Restaurant'}`,
                  },
                  unit_amount: amountInCents,
                },
                quantity: 1,
              },
            ],
            mode: 'payment',
            success_url: returnUrl || `${request.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: returnUrl || `${request.headers.origin}/cancel`,
            metadata: {
              order_id: orderData?.orderId || '',
              customer_email: email,
              restaurant_id: orderData?.restaurantId || '',
              platform: 'web',
            },
            billing_address_collection: 'required',
            shipping_address_collection: {
              allowed_countries: ['GT'], // Guatemala
            },
            phone_number_collection: {
              enabled: true,
            },
          });

          logger.info('Created checkout session', { sessionId: session.id, url: session.url });

          response.json({
            status: 'success',
            sessionId: session.id,
            checkoutUrl: session.url,
            platform: 'web',
          });
        } else {
          // For mobile: Create PaymentIntent + Customer ephemeral key
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: currency,
            customer: customer.id,
            description: `Food delivery order from ${orderData?.restaurantName || 'Restaurant'}`,
            metadata: {
              order_id: orderData?.orderId || '',
              customer_email: email,
              restaurant_id: orderData?.restaurantId || '',
              platform: 'mobile',
            },
            automatic_payment_methods: {
              enabled: true,
            },
          });

          const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2025-04-30.basil' }
          );

          logger.info('Created payment intent for mobile', { 
            paymentIntentId: paymentIntent.id,
            customerId: customer.id 
          });

          response.json({
            status: 'success',
            paymentIntent: paymentIntent.client_secret,
            ephemeralKey: ephemeralKey.secret,
            customer: customer.id,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
            platform: 'mobile',
          });
        }

        resolve();
      } catch (error) {
        logger.error('Modern checkout error:', error);
        response.status(500).json({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        resolve();
      }
    });
  });
}); 