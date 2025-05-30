/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// Comment out problematic imports
// import {onRequest} from "firebase-functions/v2/https";
// import * as logger from "firebase-functions/logger";
// import { updateAffiliatePoints } from "./affiliatePointsFunction";

// Export our working function
export { colibriCheckoutSession } from "./stripeCheckoutSession";

// You can add more functions here later as needed 