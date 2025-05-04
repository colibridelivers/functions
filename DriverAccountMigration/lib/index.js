"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDriverAccount = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
// Initialize Firebase Admin only if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.createDriverAccount = (0, https_1.onCall)(async (request) => {
    var _a;
    // Verify admin user
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.token.isAdmin)) {
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
    }
    catch (error) {
        console.error('Error creating driver account:', error);
        return {
            success: false,
            error: error.message,
        };
    }
});
//# sourceMappingURL=index.js.map