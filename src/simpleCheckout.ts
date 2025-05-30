import * as functions from "firebase-functions";

const stripe = require('stripe')(functions.config().stripe.secret);

export const simpleCheckout = functions.https.onRequest(async (req, res) => {
  // More comprehensive CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { amount, email, orderId } = req.body;

    // Minimal validation - just check we have the basics
    if (!amount || amount < 1) {
      res.status(400).json({ error: 'Amount required and must be positive' });
      return;
    }

    // Create the checkout session with minimal required fields
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gtq',
          product_data: {
            name: 'Colibri Food Delivery Order',
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      }],
      success_url: 'https://colibri-173d3.web.app/order-success',
      cancel_url: 'https://colibri-173d3.web.app/order-cancel',
      client_reference_id: orderId || `order-${Date.now()}`,
      customer_email: email,
      metadata: {
        order_id: orderId || `order-${Date.now()}`,
        customer_email: email || '',
      }
    });

    res.status(200).json({
      id: session.id,
      sessionId: session.id,
      url: session.url,
    });

  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error.message 
    });
  }
}); 