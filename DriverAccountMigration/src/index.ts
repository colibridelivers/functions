import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin only if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

interface CreateDriverData {
  email: string;
  password: string;
  driverId: string;
}

export const createDriverAccount = onCall<CreateDriverData>(async (request) => {
  // Verify admin user
  if (!request.auth?.token.isAdmin) {
    throw new Error('Only admins can create driver accounts');
  }

  try {
    const data = request.data;
    
    // Create the auth account
    const userRecord = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      emailVerified: false,
    });

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      isDriver: true,
      driverId: data.driverId,
    });

    return {
      success: true,
      userId: userRecord.uid,
    };
  } catch (error: any) {
    console.error('Error creating driver account:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}); 