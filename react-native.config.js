// Card payments are not part of the iPhone app (App Store guideline 3.1.1),
// and nothing in the app calls Stripe, so its native SDK stays out of the
// iOS build.
module.exports = {
  dependencies: {
    '@stripe/stripe-react-native': {
      platforms: { ios: null },
    },
  },
};
