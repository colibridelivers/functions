# Stripe Android PaymentSheet Function

This Firebase function creates a payment sheet for Android integration with Stripe.

## Purpose

This function provides the necessary data for implementing the Stripe PaymentSheet in Android:
- PaymentIntent client secret
- Customer ID
- Ephemeral Key
- Publishable Key

## Deployment

1. Set up Stripe API keys in Firebase config:

```bash
firebase functions:config:set stripe.secret="sk_live_YOUR_STRIPE_SECRET_KEY" stripe.publishable="pk_live_YOUR_STRIPE_PUBLISHABLE_KEY"
```

2. Deploy just this function:

```bash
cd /functions
firebase deploy --only functions:AppleStripe
```

## Usage in Flutter App

In your Flutter app, call this function:

```dart
// Call the Firebase function
final functions = FirebaseFunctions.instance;
final result = await functions.httpsCallable('AppleStripe-createPaymentSheet').call({
  'amount': (amount * 100).round(),  // Convert to smallest currency unit
  'currency': 'gtq',                 // Your currency code
  'email': userEmail,
  'name': userName,
  'order': orderData,                // Optional order details
});

// Use the result to initialize the PaymentSheet
final responseData = result.data;
await Stripe.instance.initPaymentSheet(
  paymentSheetParameters: SetupPaymentSheetParameters(
    merchantDisplayName: 'Colibri Delivers',
    paymentIntentClientSecret: responseData['paymentIntent'],
    customerEphemeralKeySecret: responseData['ephemeralKey'],
    customerId: responseData['customer'],
    style: ThemeMode.light,
  ),
);

// Present the PaymentSheet
await Stripe.instance.presentPaymentSheet();
```

## Troubleshooting

Check Firebase function logs for detailed error information:

```bash
firebase functions:log --only AppleStripe-createPaymentSheet
``` 