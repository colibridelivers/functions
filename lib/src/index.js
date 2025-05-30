"use strict";
/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.colibriCheckoutSession = void 0;
// Comment out problematic imports
// import {onRequest} from "firebase-functions/v2/https";
// import * as logger from "firebase-functions/logger";
// import { updateAffiliatePoints } from "./affiliatePointsFunction";
// Export our working function
var stripeCheckoutSession_1 = require("./stripeCheckoutSession");
Object.defineProperty(exports, "colibriCheckoutSession", { enumerable: true, get: function () { return stripeCheckoutSession_1.colibriCheckoutSession; } });
// You can add more functions here later as needed 
//# sourceMappingURL=index.js.map