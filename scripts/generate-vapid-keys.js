const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('Copy these values into your local .env file. Keep the private key secret.');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
