import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';

// Initialize Firebase Admin only if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const TWILIO_ACCOUNT_SID = functions.config().twilio.account_sid;
const TWILIO_AUTH_TOKEN = functions.config().twilio.auth_token;
const TWILIO_FROM_NUMBER = functions.config().twilio.from_number;
const ADMIN_PHONE_NUMBERS = functions.config().admin.phone_numbers.split(',');

export const whatsappAlert2024 = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        try {
            const orderId = context.params.orderId;
            const orderData = snap.data();

            console.log('New order detected:', { orderId, orderData });

            if (!orderData) {
                throw new Error('No order data found');
            }

            // Create a more detailed message
            const message = `🆕 New Order #${orderId}!\n\n` +
                          `🏠 From: ${orderData.restaurantName}\n` +
                          `💰 Total: Q${orderData.totalPrice}\n\n` +
                          `Check details at: https://godmode.colibridelivers.com`;

            // Send to all admin numbers with retry logic
            for (const phoneNumber of ADMIN_PHONE_NUMBERS) {
                await retryOperation(() => sendWhatsAppMessage(phoneNumber, message));
            }

            return { success: true };
        } catch (error) {
            console.error('Error in whatsappAlert2024:', error);
            throw error;
        }
    });

async function sendWhatsAppMessage(to: string, message: string, retryCount = 0) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    try {
        const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const formattedFrom = TWILIO_FROM_NUMBER.startsWith('whatsapp:') ? 
            TWILIO_FROM_NUMBER : `whatsapp:${TWILIO_FROM_NUMBER}`;

        console.log('Sending WhatsApp message:', {
            to: formattedTo,
            from: formattedFrom,
            messageLength: message.length
        });

        const response = await axios.post(url, 
            new URLSearchParams({
                'To': formattedTo,
                'From': formattedFrom,
                'Body': message
            }), {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000 // 10 second timeout
        });
        
        console.log('Twilio API Response:', {
            status: response.status,
            data: response.data
        });

        return response.data;
    } catch (error: any) {
        console.error('Error sending WhatsApp message:', {
            attempt: retryCount + 1,
            status: error.response?.status,
            statusText: error.response?.statusText,
            errorMessage: error.response?.data?.message,
            errorCode: error.response?.data?.code,
            to: to,
            from: TWILIO_FROM_NUMBER
        });
        throw error;
    }
}

// Add retry logic
async function retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
    
    throw lastError;
}

// Test endpoint
export const testWhatsApp = functions.https.onRequest(async (req, res) => {
    try {
        const testMessage = '🧪 Test Message from Colibri\n' +
                          'If you receive this, WhatsApp notifications are working!';
        
        const results = await Promise.all(
            ADMIN_PHONE_NUMBERS.map((number: string) => 
                retryOperation(() => sendWhatsAppMessage(number, testMessage))
            )
        );

        res.json({ 
            success: true, 
            message: 'Test messages sent successfully',
            results 
        });
    } catch (error: any) {
        console.error('Error in test function:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: error.response?.data
        });
    }
});
