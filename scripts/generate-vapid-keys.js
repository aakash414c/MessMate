const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
const currentEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const parsedEnv = dotenv.parse(currentEnv);

if (parsedEnv.VAPID_PUBLIC_KEY && parsedEnv.VAPID_PRIVATE_KEY) {
	console.log('A VAPID key pair is already configured in .env; it was left unchanged.');
	process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
const envLines = currentEnv.split(/\r?\n/).filter(line => !/^\s*VAPID_(?:PUBLIC|PRIVATE)_KEY\s*=/.test(line));
while (envLines.length && !envLines[envLines.length - 1]) envLines.pop();
envLines.push(`VAPID_PUBLIC_KEY=${keys.publicKey}`, `VAPID_PRIVATE_KEY=${keys.privateKey}`);
fs.writeFileSync(envPath, `${envLines.join('\n')}\n`, { mode: 0o600 });
console.log('Generated a VAPID key pair in .env. Keep the private key secret and restart the app to apply it.');
